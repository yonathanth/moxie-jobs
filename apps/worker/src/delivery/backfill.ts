import { prisma } from "../db";
import { log } from "../log";
import { backfillUser } from "./matcher";

// Short: right after setup the Mini App shows "finding your matches" until this has run.
const CHECK_MS = 5_000;
/** On start, also catch saves from just before a restart. Re-running is safe: (userId, jobId) is unique. */
const STARTUP_LOOKBACK_MS = 10 * 60_000;

/**
 * Watches for preference saves (onboarding or edits; the API upserts
 * UserPreferences on every save, bumping updatedAt) and backfills each user
 * with matching jobs that are already open.
 */
export class BackfillWatcher {
  private cursor = new Date(Date.now() - STARTUP_LOOKBACK_MS);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(private readonly onQueued: () => void) {}

  start() {
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async check() {
    if (this.busy) return;
    this.busy = true;
    try {
      const changed = await prisma.userPreferences.findMany({
        where: { updatedAt: { gt: this.cursor } },
        select: { userId: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
        take: 100,
      });
      let queued = 0;
      for (const row of changed) {
        queued += await backfillUser(row.userId).catch((err: unknown) => {
          log.error({ user: row.userId, err: String(err) }, "backfill failed");
          return 0;
        });
        // Done matching this save (the feed stops showing "finding matches"). Raw SQL so updatedAt, which this
        // watcher reads as a save, doesn't move; set to the save's own time so a newer save still counts as pending.
        await prisma.$executeRaw`UPDATE "UserPreferences" SET "matchedAt" = ${row.updatedAt} WHERE "userId" = ${row.userId} AND ("matchedAt" IS NULL OR "matchedAt" < ${row.updatedAt})`.catch(
          (err: unknown) => log.error({ user: row.userId, err: String(err) }, "matchedAt not saved"),
        );
        this.cursor = row.updatedAt;
      }
      if (queued) this.onQueued();
    } catch (err) {
      log.error({ err: String(err) }, "backfill check failed");
    } finally {
      this.busy = false;
    }
  }
}
