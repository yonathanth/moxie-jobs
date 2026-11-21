export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "gomoxiebot";
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;
/** Local development only: sign in without Telegram (the API must also allow it). */
export const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "true";
/** Dev login as a real Telegram user id, so the bot's alerts reach your own chat. */
export const DEV_TELEGRAM_ID = Number(process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID) || undefined;
