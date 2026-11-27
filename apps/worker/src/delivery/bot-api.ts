import { versionedCardUrl } from "@ethio/shared";
import { env } from "../env";

/**
 * Minimal Telegram Bot API client for sending alerts. Only sendMessage: the
 * API process owns update handling (webhook/polling), so there's no conflict.
 * Global pacing keeps us under Telegram's ~30 msg/s limit.
 */

export class BotBlockedError extends Error {}
/** 400 "chat not found": they opened the Mini App but never pressed Start or allowed messages. */
export class ChatNotFoundError extends Error {}

interface BotResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

const MIN_GAP_MS = 40; // ≈ 25 messages/second overall
let nextSlot = 0;

async function pace() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function call<T>(method: string, body: Record<string, unknown>, attempt = 0): Promise<T> {
  await pace();
  const res = await fetch(`https://api.telegram.org/bot${env().TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as BotResponse<T>;
  if (data.ok) return data.result as T;

  if (data.error_code === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, ((data.parameters?.retry_after ?? 1) + 0.5) * 1000));
    return call(method, body, attempt + 1);
  }
  if (data.error_code === 403) throw new BotBlockedError(data.description ?? "bot blocked");
  if (data.error_code === 400 && /chat not found/i.test(data.description ?? "")) throw new ChatNotFoundError(data.description ?? "chat not found");
  throw new Error(`Telegram ${method} failed (${data.error_code}): ${data.description}`);
}

export interface SendOptions {
  buttons?: { text: string; url?: string; web_app?: { url: string }; callback_data?: string }[][];
}

/** Sends an HTML message; if Telegram rejects a button URL, retries without buttons. Returns the message id. */
export async function sendMessage(chatId: bigint, text: string, opts: SendOptions = {}): Promise<number> {
  const base = { chat_id: chatId.toString(), text, parse_mode: "HTML", link_preview_options: { is_disabled: true } };
  try {
    const msg = await call<{ message_id: number }>("sendMessage", {
      ...base,
      ...(opts.buttons?.length ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
    });
    return msg.message_id;
  } catch (err) {
    if (opts.buttons?.length && err instanceof Error && /BUTTON|URL/i.test(err.message) && !(err instanceof BotBlockedError)) {
      const msg = await call<{ message_id: number }>("sendMessage", base);
      return msg.message_id;
    }
    throw err;
  }
}

/** Telegram's id for a picture already uploaded, by its web path: identical cards aren't uploaded twice. */
const fileIds = new Map<string, string>();

async function callMultipart<T>(method: string, form: FormData, attempt = 0): Promise<T> {
  await pace();
  const res = await fetch(`https://api.telegram.org/bot${env().TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  const data = (await res.json()) as BotResponse<T>;
  if (data.ok) return data.result as T;
  if (data.error_code === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, ((data.parameters?.retry_after ?? 1) + 0.5) * 1000));
    return callMultipart(method, form, attempt + 1);
  }
  if (data.error_code === 403) throw new BotBlockedError(data.description ?? "bot blocked");
  throw new Error(`Telegram ${method} failed (${data.error_code}): ${data.description}`);
}

/**
 * A picture message: the card is drawn by the web app at `imagePath` (e.g. "/og/msg/upgrade?price=199")
 * and uploaded (so it works in local dev too). If the picture can't be made, the caption goes as text.
 */
export async function sendPhoto(chatId: bigint, imagePath: string, caption: string, opts: SendOptions = {}): Promise<number> {
  const markup = opts.buttons?.length ? JSON.stringify({ inline_keyboard: opts.buttons }) : null;
  const known = fileIds.get(imagePath);
  try {
    let form = new FormData();
    if (known) form.set("photo", known);
    else {
      const img = await fetch(versionedCardUrl(imagePath, env().WEB_APP_URL), { signal: AbortSignal.timeout(20_000) });
      if (!img.ok) throw new Error(`card ${imagePath} → ${img.status}`);
      form.set("photo", new Blob([await img.arrayBuffer()], { type: "image/jpeg" }), "card.jpg");
    }
    const fill = (f: FormData) => {
      f.set("chat_id", chatId.toString());
      f.set("caption", caption);
      f.set("parse_mode", "HTML");
      if (markup) f.set("reply_markup", markup);
      return f;
    };
    form = fill(form);
    const msg = await callMultipart<{ message_id: number; photo?: { file_id: string }[] }>("sendPhoto", form);
    const id = msg.photo?.at(-1)?.file_id;
    if (id) fileIds.set(imagePath, id);
    return msg.message_id;
  } catch (err) {
    if (err instanceof BotBlockedError) throw err;
    return sendMessage(chatId, caption, opts);
  }
}
