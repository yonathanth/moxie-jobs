/**
 * Website sources (Source.kind = "website"). An adapter lists a site's current
 * vacancies; the runner stores new/changed ones as RawPosts, so the normal
 * pipeline (prefilter → AI extraction → normalize → dedup → match) handles them.
 */

/** One vacancy, ready to store as a RawPost. */
export interface WebItem {
  /** Stable numeric id from the site (RawPost.messageId; unique per source). */
  externalId: bigint;
  /** Canonical page for the vacancy: becomes the job's "Source" link. */
  url: string;
  postedAt: Date;
  /** Plain text for the extractor (title, employer, location, description, how to apply). */
  text: string;
}

/** A vacancy found on a listing; `item` is filled when the listing already has the full text. */
export interface WebListing {
  externalId: bigint;
  url: string;
  postedAt: Date | null;
  item?: WebItem;
}

export interface WebAdapter {
  /** Source.id this adapter feeds. */
  sourceId: string;
  intervalMs: number;
  /** Null when ready; otherwise why it can't run (e.g. missing credentials). */
  notReady(): string | null;
  list(): Promise<WebListing[]>;
  /** Fetches the full vacancy for a listing without `item`. Null = skip it. */
  load?(listing: WebListing): Promise<WebItem | null>;
}

/** Keeps extractor input bounded (long NGO descriptions run to 20k+ chars). */
export const MAX_ITEM_TEXT = 7_000;

export function clampText(text: string): string {
  const t = text.replace(/\n{3,}/g, "\n\n").trim();
  return t.length > MAX_ITEM_TEXT ? `${t.slice(0, MAX_ITEM_TEXT)}…` : t;
}
