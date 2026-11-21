/**
 * One-time interactive login for the listener account. Run in a real terminal:
 *   pnpm --filter @ethio/worker tg:login          # code login
 *   pnpm --filter @ethio/worker tg:login --qr     # QR login (when Telegram withholds the code)
 *
 * Telegram usually delivers the code INSIDE the Telegram app (a message from
 * the official "Telegram" account on a device already logged in with this
 * number), not by SMS. The script prints how the code was sent; type "sms"
 * to ask Telegram to resend it another way (SMS / phone call), if offered.
 *
 * Prints a session string: put it in .env as TG_SESSION=... and keep it secret
 * (it is full access to that Telegram account).
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Api, type TelegramClient } from "telegram";
import { env } from "../env";
import { createTelegramClient } from "../telegram/client";

const DELIVERY: Record<string, string> = {
  "auth.SentCodeTypeApp": "in the Telegram app (message from the official 'Telegram' account on a device logged in with this number)",
  "auth.SentCodeTypeSms": "by SMS",
  "auth.SentCodeTypeCall": "by phone call (a voice reads the code)",
  "auth.SentCodeTypeFlashCall": "by a missed call (the code is the last digits of the caller's number)",
  "auth.SentCodeTypeMissedCall": "by a missed call (the code is the last digits of the caller's number)",
  "auth.SentCodeTypeFragmentSms": "via Fragment (anonymous number)",
  "auth.SentCodeTypeEmailCode": "to the login email address of this account",
  "auth.SentCodeTypeFirebaseSms": "by SMS",
  "auth.SentCodeTypeSmsWord": "by SMS (a word)",
  "auth.SentCodeTypeSmsPhrase": "by SMS (a phrase)",
};

function describe(sent: Api.auth.SentCode): string {
  const how = DELIVERY[sent.type.className] ?? sent.type.className;
  const next = sent.nextType ? ` If it doesn't arrive${sent.timeout ? ` within ${sent.timeout}s` : ""}, type "sms" to get it ${DELIVERY[sent.nextType.className] ?? sent.nextType.className}.` : "";
  return `Code sent ${how}.${next}`;
}

const QR_PAGE = join(tmpdir(), "ethio-jobs-telegram-login.html");

/** Writes a self-refreshing page showing the login QR (rendered in the browser, no extra packages). */
function writeQrPage(url: string, expires: Date) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5">
<title>Telegram login</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f4f5f7;color:#14161a}
main{background:#fff;padding:32px;border-radius:16px;text-align:center;max-width:360px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
#qr{display:inline-block;padding:12px;background:#fff}p{line-height:1.5}</style></head>
<body><main><h2>Scan with Telegram</h2><div id="qr"></div>
<p>On your phone (logged in as the listener account): <b>Settings → Devices → Link Desktop Device</b>, then scan.</p>
<p style="color:#7d8590;font-size:13px">Refreshes automatically. Code valid until ${expires.toLocaleTimeString()}.</p></main>
<script>new QRCode(document.getElementById("qr"),{text:${JSON.stringify(url)},width:256,height:256});</script></body></html>`;
  writeFileSync(QR_PAGE, html);
}

async function loginWithQr(rl: ReturnType<typeof createInterface>) {
  const e = env();
  const client = createTelegramClient("");
  await client.connect();
  let announced = false;
  await client.signInUserWithQrCode(
    { apiId: e.TG_API_ID, apiHash: e.TG_API_HASH },
    {
      qrCode: async ({ token, expires }) => {
        writeQrPage(`tg://login?token=${token.toString("base64url")}`, new Date(expires * 1000));
        if (!announced) {
          announced = true;
          console.log(`\nOpen this file in your browser and scan the QR with your phone:\n  ${QR_PAGE}\n`);
          console.log("Phone: Telegram → Settings → Devices → Link Desktop Device. Waiting for the scan…");
        }
      },
      password: async () => (await rl.question("Two-step verification password: ")).trim(),
      onError: async (err) => {
        console.error("Login error:", err.message);
        return true; // stop
      },
    },
  );
  return client;
}

async function printSession(client: TelegramClient, rl: ReturnType<typeof createInterface>) {
  const me = await client.getMe();
  const session = client.session.save() as unknown as string;
  console.log(`\nLogged in as ${me.firstName ?? ""} (id ${String(me.id)}).`);
  console.log("\nAdd this line to .env (keep it secret):\n");
  console.log(`TG_SESSION=${session}\n`);
  rl.close();
  await client.disconnect();
  process.exit(0);
}

async function main() {
  const e = env();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (process.argv.includes("--qr")) {
    return printSession(await loginWithQr(rl), rl);
  }
  const client = createTelegramClient("");
  await client.connect();
  console.log(`Requesting a login code for ${e.TG_PHONE}…`);

  const first = await client.invoke(
    new Api.auth.SendCode({ phoneNumber: e.TG_PHONE, apiId: e.TG_API_ID, apiHash: e.TG_API_HASH, settings: new Api.CodeSettings({}) }),
  );
  if (!(first instanceof Api.auth.SentCode)) {
    throw new Error(`Unexpected reply ${first.className}. This number may need to finish sign-up in the official app first.`);
  }
  if (first.type instanceof Api.auth.SentCodeTypeSetUpEmailRequired) {
    throw new Error("Telegram requires this account to set up a login email first. Log in once in the official Telegram app, add a login email, then run this again.");
  }
  let sent: Api.auth.SentCode = first;
  console.log(describe(sent));

  let signedIn = false;
  while (!signedIn) {
    const answer = (await rl.question('Enter the code (or "sms" to resend another way): ')).trim();
    if (answer.toLowerCase() === "sms") {
      if (!sent.nextType) {
        console.log("Telegram offers no other delivery method for this login. Check the Telegram app on your other devices.");
        continue;
      }
      const resent = await client.invoke(new Api.auth.ResendCode({ phoneNumber: e.TG_PHONE, phoneCodeHash: sent.phoneCodeHash }));
      if (resent instanceof Api.auth.SentCode) sent = resent;
      console.log(describe(sent));
      continue;
    }
    const code = answer.replace(/\D/g, "");
    if (!code) continue;
    try {
      const result = await client.invoke(new Api.auth.SignIn({ phoneNumber: e.TG_PHONE, phoneCodeHash: sent.phoneCodeHash, phoneCode: code }));
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        throw new Error("This number has no Telegram account yet. Sign up once in the official Telegram app, then run this again.");
      }
      signedIn = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("SESSION_PASSWORD_NEEDED")) {
        await client.signInWithPassword(
          { apiId: e.TG_API_ID, apiHash: e.TG_API_HASH },
          {
            password: async () => (await rl.question("Two-step verification password: ")).trim(),
            onError: async (pwErr) => {
              console.error("Password error:", pwErr.message);
              return false;
            },
          },
        );
        signedIn = true;
      } else if (message.includes("PHONE_CODE_INVALID")) {
        console.log("Wrong code, try again.");
      } else if (message.includes("PHONE_CODE_EXPIRED")) {
        throw new Error("The code expired. Run tg:login again.");
      } else {
        throw err;
      }
    }
  }

  await printSession(client, rl);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("FLOOD")) {
    console.error(`Telegram is rate-limiting login attempts for this number: ${message}. Wait the indicated time before trying again.`);
  } else if (message.includes("PHONE_NUMBER_INVALID")) {
    console.error("Telegram says the phone number is invalid. Check TG_PHONE in .env (international format, e.g. +2519…).");
  } else if (message.includes("API_ID_INVALID")) {
    console.error("TG_API_ID / TG_API_HASH are not valid. Copy them again from my.telegram.org → API development tools.");
  } else {
    console.error(message);
  }
  process.exit(1);
});
