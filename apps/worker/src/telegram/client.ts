import { TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger";
import { StringSession } from "telegram/sessions";
import { env } from "../env";

/** The listener's user-account client. Read-only use: never send, react or forward from it. */
export function createTelegramClient(session = env().TG_SESSION): TelegramClient {
  const e = env();
  const client = new TelegramClient(new StringSession(session), e.TG_API_ID, e.TG_API_HASH, {
    connectionRetries: 10,
    retryDelay: 2_000,
    autoReconnect: true,
    floodSleepThreshold: 120, // auto-sleep on FLOOD_WAIT up to 2 minutes
    deviceModel: "GoMoxie Jobs Listener",
    appVersion: "1.0",
  });
  client.setLogLevel(LogLevel.ERROR);
  return client;
}

export async function connectListener(): Promise<TelegramClient> {
  if (!env().TG_SESSION) {
    throw new Error("TG_SESSION is empty. Run `pnpm --filter @ethio/worker tg:login` once and put the printed session in .env");
  }
  const client = createTelegramClient();
  await client.connect();
  if (!(await client.checkAuthorization())) {
    throw new Error("TG_SESSION is no longer valid (logged out?). Run tg:login again.");
  }
  return client;
}
