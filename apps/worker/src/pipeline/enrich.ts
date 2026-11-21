import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { env } from "../env";
import { onSourceDomain } from "./normalize";

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 6_000;
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const PER_HOST_GAP_MS = 1_000;

const robotsCache = new Map<string, { at: number; allowed: (url: string) => boolean }>();
const lastHit = new Map<string, number>();

/** Picks the first link on the source's own website (docs/ingestion-spec.md §6). */
export function pickPageUrl(urls: string[], domains: string[]): string | null {
  return urls.find((u) => onSourceDomain(u, domains)) ?? null;
}

/** Main readable text of an HTML page. Pure, exported for tests. */
export function extractMainText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, aside, form, iframe, svg, .share, .social, .related, .comments").remove();
  // .text() concatenates sibling blocks ("Accountant" + "Duties" → "AccountantDuties"); separate them.
  $("p, div, li, br, tr, td, th, h1, h2, h3, h4, h5, h6, section, article, dd, dt").after(" ");
  const candidates = ["article", "main", ".job-description", ".entry-content", ".post-content", ".job-details", "#content", "body"];
  for (const sel of candidates) {
    const text = $(sel).first().text().replace(/\s+/g, " ").trim();
    if (text.length > 200) return text.slice(0, MAX_TEXT);
  }
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; url: string; body: string; contentType: string }> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": env().FETCH_USER_AGENT, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9" },
  });
  const contentType = res.headers.get("content-type") ?? "";
  const reader = res.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }
  return { ok: res.ok, status: res.status, url: res.url, body: Buffer.concat(chunks).toString("utf8"), contentType };
}

async function robotsAllows(url: URL): Promise<boolean> {
  const cached = robotsCache.get(url.host);
  if (cached && Date.now() - cached.at < ROBOTS_TTL_MS) return cached.allowed(url.toString());
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
  let allowed: (u: string) => boolean = () => true;
  try {
    const res = await fetchText(robotsUrl);
    if (res.ok) {
      const robots = robotsParser(robotsUrl, res.body);
      allowed = (u) => robots.isAllowed(u, env().FETCH_USER_AGENT) !== false;
    }
  } catch {
    // robots.txt unreachable: treat as allowed (standard behaviour)
  }
  robotsCache.set(url.host, { at: Date.now(), allowed });
  return allowed(url.toString());
}

async function politeDelay(host: string) {
  const wait = (lastHit.get(host) ?? 0) + PER_HOST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

/**
 * Polite GET: robots.txt checked, ≥1 s between hits per host, 8 s timeout, 2 MB cap.
 * Returns null (never throws) when disallowed, failed, or not the expected content type.
 */
export async function politeFetch(
  rawUrl: string,
  accept: "html" | "xml" = "html",
): Promise<{ url: string; body: string } | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!(await robotsAllows(url))) return null;
  await politeDelay(url.host);
  try {
    const res = await fetchText(url.toString());
    if (!res.ok || !res.contentType.includes(accept)) return null;
    return { url: res.url || url.toString(), body: res.body };
  } catch {
    return null;
  }
}

/** Fetches a source page's main text. Returns null (never throws) when not allowed or unavailable. */
export async function fetchPageText(rawUrl: string, domains: string[]): Promise<{ url: string; text: string } | null> {
  if (!onSourceDomain(rawUrl, domains)) return null;
  const page = await politeFetch(rawUrl);
  if (!page) return null;
  const text = extractMainText(page.body);
  return text.length >= 80 ? { url: rawUrl, text } : null;
}
