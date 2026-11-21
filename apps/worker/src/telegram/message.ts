/**
 * Reads text, links and inline buttons from a GramJS message. Duck-typed on
 * TL `className` so it can be unit-tested without a Telegram connection.
 */

export interface PostButton {
  text: string;
  url: string;
}

interface TlObject {
  className?: string;
}
interface Entity extends TlObject {
  offset: number;
  length: number;
  url?: string;
}
interface Button extends TlObject {
  text?: string;
  url?: string;
}
export interface MessageLike {
  id: number;
  date: number;
  editDate?: number;
  message?: string;
  entities?: Entity[];
  replyMarkup?: TlObject & { rows?: { buttons: Button[] }[] };
}

export function messageText(m: MessageLike): string {
  return (m.message ?? "").trim();
}

export function messageLinks(m: MessageLike): string[] {
  const text = m.message ?? "";
  const links = new Set<string>();
  for (const e of m.entities ?? []) {
    if (e.className === "MessageEntityTextUrl" && e.url) links.add(e.url);
    else if (e.className === "MessageEntityUrl") {
      const raw = text.substr(e.offset, e.length);
      links.add(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    }
  }
  return [...links].filter(isHttpUrl);
}

export function messageButtons(m: MessageLike): PostButton[] {
  if (m.replyMarkup?.className !== "ReplyInlineMarkup") return [];
  const buttons: PostButton[] = [];
  for (const row of m.replyMarkup.rows ?? []) {
    for (const b of row.buttons) {
      if (typeof b.url === "string" && isHttpUrl(b.url)) buttons.push({ text: (b.text ?? "").trim(), url: b.url });
    }
  }
  return buttons;
}

function isHttpUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
