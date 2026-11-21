import { createHmac, timingSafeEqual } from "node:crypto";

/** The Telegram user object inside Mini App initData. */
export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  is_bot?: boolean;
}

export interface VerifiedInitData {
  user: TelegramWebAppUser;
  authDate: Date;
  startParam?: string;
}

export class InitDataError extends Error {}

/**
 * Verifies Telegram Mini App initData as documented at
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * secret = HMAC_SHA256(key="WebAppData", botToken); hash = HMAC_SHA256(key=secret, dataCheckString)
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
  now: Date = new Date(),
): VerifiedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw new InitDataError("missing or malformed hash");

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new InitDataError("signature mismatch");
  }

  const authDateSec = Number(params.get("auth_date"));
  if (!Number.isFinite(authDateSec) || authDateSec <= 0) throw new InitDataError("missing auth_date");
  const ageSeconds = now.getTime() / 1000 - authDateSec;
  if (ageSeconds > maxAgeSeconds) throw new InitDataError("initData expired");
  if (ageSeconds < -300) throw new InitDataError("auth_date is in the future");

  const rawUser = params.get("user");
  if (!rawUser) throw new InitDataError("missing user");
  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(rawUser) as TelegramWebAppUser;
  } catch {
    throw new InitDataError("malformed user");
  }
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new InitDataError("malformed user id");
  if (user.is_bot) throw new InitDataError("bots cannot sign in");

  return {
    user,
    authDate: new Date(authDateSec * 1000),
    startParam: params.get("start_param") ?? undefined,
  };
}
