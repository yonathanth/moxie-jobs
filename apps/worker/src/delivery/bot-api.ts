import { env } from "../env";

/**
 * Minimal Telegram Bot API client for sending alerts. Only sendMessage: the
 * API process owns update handling (webhook/polling), so there's no conflict.
 * Global pacing keeps us under Telegram's ~30 msg/s limit.
 */

export class BotBlockedError extends Error {}

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
