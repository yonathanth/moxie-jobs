export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "gomoxiebot";
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;
/** Local development only: sign in without Telegram (the API must also allow it). */
export const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "true";
/** Dev login as a real Telegram user id, so the bot's alerts reach your own chat. */
export const DEV_TELEGRAM_ID = Number(process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID) || undefined;
/** Product name shown to people (shared links, previews). One place, for the rebrand. */
export const APP_NAME = "Gursha Jobs";
/** Deep link that opens the bot on a shared job (the bot replies with that job). */
export const botJobLink = (jobId: string) => `${BOT_URL}?start=job_${jobId}`;
/** Opens the job straight in the Mini App (the bot's Main Mini App, set in BotFather); routed by SessionGate. */
export const miniAppJobLink = (jobId: string) => `${BOT_URL}?startapp=job_${jobId}`;
/** Public address of this site: absolute URLs in link previews (og:image). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === "production" ? "https://jobs.gomoxie.app" : "http://localhost:3000")
).replace(/\/$/, "");
