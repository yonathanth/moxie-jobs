import * as cheerio from "cheerio";
import { politeFetch } from "../pipeline/enrich";
import { clampText, type WebAdapter, type WebItem, type WebListing } from "./types";

/**
 * African Union careers (jobs.au.int, SAP SuccessFactors). The search page loads
 * results with JavaScript through /services/ (disallowed in robots.txt), so we
 * read the public sitemap and each job page, both allowed. Every vacancy is
 * listed once per language; we keep the English (en_US) version.
 */

const SITEMAP_URL = "https://jobs.au.int/sitemap.xml";

/** Job URLs, ids and lastmod dates from the sitemap. Pure, unit-tested. */
export function parseAuSitemap(xml: string): WebListing[] {
  const listings: WebListing[] = [];
  const seen = new Set<bigint>();
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    const id = loc?.match(/\/job\/[^/]+\/(\d+)\/?$/)?.[1];
    if (!loc || !id) continue;
    const externalId = BigInt(id);
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const lastmod = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1];
    const date = lastmod ? new Date(lastmod) : null;
    listings.push({ externalId, url: loc, postedAt: date && !Number.isNaN(date.getTime()) ? date : null });
  }
  return listings;
}

/** Title + description text of a job page; null when it isn't an English job page. Pure, unit-tested. */
export function parseAuJobPage(html: string, finalUrl: string): { title: string; text: string } | null {
  if (!/-en_US\/?$/i.test(new URL(finalUrl).pathname)) return null;
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  $("p, div, li, br, tr, h1, h2, h3, h4, h5, h6, section, article").after("\n");
  const title = $('[itemprop="title"]').first().text().replace(/\s+/g, " ").trim();
  let description = "";
  $('[itemprop="description"]').each((_, el) => {
    const t = $(el).text();
    if (t.trim().length > description.trim().length) description = t;
  });
  const body = description
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (!title || body.length < 80) return null;
  return { title, text: body };
}

export class AfricanUnionAdapter implements WebAdapter {
  readonly sourceId = "african_union";
  readonly intervalMs = 6 * 60 * 60_000;

  notReady(): string | null {
    return null;
  }

  async list(): Promise<WebListing[]> {
    const sitemap = await politeFetch(SITEMAP_URL, "xml");
    if (!sitemap) throw new Error("AU sitemap unavailable or disallowed");
    return parseAuSitemap(sitemap.body);
  }

  async load(listing: WebListing): Promise<WebItem | null> {
    const page = await politeFetch(listing.url);
    if (!page) return null;
    const parsed = parseAuJobPage(page.body, page.url);
    if (!parsed) return null;
    return {
      externalId: listing.externalId,
      url: page.url,
      postedAt: listing.postedAt ?? new Date(),
      text: clampText(`${parsed.title}\nEmployer: African Union (jobs.au.int)\n\n${parsed.text}`),
    };
  }
}
