import { Prisma } from "@ethio/db";
import { prisma } from "../db";
import { log } from "../log";
import { textHash } from "../pipeline/text";
import type { WebAdapter, WebItem, WebListing } from "./types";

/**
 * Polls each website adapter on its own interval and stores new or changed
 * vacancies as RawPosts. Only sources marked active (sources resume <key>) run.
 */
export class WebSourceRunner {
  private timers: NodeJS.Timeout[] = [];
  private busy = new Set<string>();
  /** Listings an adapter declined to load (e.g. other-language duplicates): don't refetch every poll. */
  private declined = new Map<string, Set<bigint>>();

  constructor(
    private readonly adapters: WebAdapter[],
    private readonly onStored: () => void,
  ) {}

  start() {
    for (const adapter of this.adapters) {
      const reason = adapter.notReady();
      if (reason) {
        log.warn({ source: adapter.sourceId, reason }, "web source not ready, skipping");
        continue;
      }
      void this.run(adapter);
      this.timers.push(setInterval(() => void this.run(adapter), adapter.intervalMs));
    }
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
  }

  async run(adapter: WebAdapter): Promise<number> {
    if (this.busy.has(adapter.sourceId)) return 0;
    this.busy.add(adapter.sourceId);
    const started = Date.now();
    try {
      const source = await prisma.source.findUnique({ where: { id: adapter.sourceId } });
      if (!source?.isActive) return 0;

      const listings = await adapter.list();
      const existing = new Map(
        (
          await prisma.rawPost.findMany({
            where: { sourceId: source.id, messageId: { in: listings.map((l) => l.externalId) } },
            select: { id: true, messageId: true, textHash: true },
          })
        ).map((p) => [p.messageId, p]),
      );
      const declined = this.declined.get(source.id) ?? new Set<bigint>();
      this.declined.set(source.id, declined);

      let stored = 0;
      for (const listing of listings) {
        const known = existing.get(listing.externalId);
        if (known && !listing.item) continue; // page-based source: fetch each vacancy once
        if (!known && !listing.item && declined.has(listing.externalId)) continue;
        const item = listing.item ?? (await this.load(adapter, listing));
        if (!item) {
          declined.add(listing.externalId);
          continue;
        }
        if (await this.store(source.id, item, known)) stored++;
      }
      if (stored) this.onStored();
      log.info({ source: source.id, listed: listings.length, stored, ms: Date.now() - started }, "web source polled");
      return stored;
    } catch (err) {
      log.error({ source: adapter.sourceId, err: String(err) }, "web source poll failed");
      return 0;
    } finally {
      this.busy.delete(adapter.sourceId);
    }
  }

  private async load(adapter: WebAdapter, listing: WebListing): Promise<WebItem | null> {
    try {
      return (await adapter.load?.(listing)) ?? null;
    } catch (err) {
      log.warn({ source: adapter.sourceId, url: listing.url, err: String(err) }, "web item load failed");
      return null;
    }
  }

  /** Returns true when a new or meaningfully changed vacancy was queued. */
  private async store(sourceId: string, item: WebItem, known?: { id: string; textHash: string }): Promise<boolean> {
    const data = {
      text: item.text,
      buttons: [] as unknown as Prisma.InputJsonValue,
      links: [item.url],
      textHash: textHash(item.text),
      postedAt: item.postedAt,
    };
    if (known) {
      if (known.textHash === data.textHash) return false;
      // Edited vacancy: re-process (dedup merges into the same job; no re-notification).
      await prisma.rawPost.update({
        where: { id: known.id },
        data: { ...data, editedAt: new Date(), status: "new", attempts: 0, error: null, pageText: null, pageUrl: null },
      });
      return true;
    }
    try {
      await prisma.rawPost.create({ data: { sourceId, messageId: item.externalId, ...data } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
      throw err;
    }
  }
}
