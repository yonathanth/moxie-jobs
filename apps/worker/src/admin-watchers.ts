import type { Job } from "@ethio/db";
import type { TelegramClient } from "telegram";
import { prisma } from "./db";
import { log } from "./log";
import { joinChannel } from "./telegram/join";

/**
 * Background jobs driven by the admin tools:
 *  - ReviewWatcher: jobs an admin approved (status active + flag "reviewed")
 *    are matched like new jobs, so users get alerts while still within the alert window.
 *  - JoinWatcher: channels added from the admin are joined one at a time, spaced out
 *    (many joins in a short time get Telegram accounts restricted).
 */

const REVIEW_CHECK_MS = 60_000;
const JOIN_CHECK_MS = 3 * 60_000;

export class ReviewWatcher {
  private cursor = new Date(Date.now() - 10 * 60_000);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(private readonly onApproved: (job: Job) => Promise<void>) {}

  start() {
    this.timer = setInterval(() => void this.check(), REVIEW_CHECK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async check() {
    if (this.busy) return;
    this.busy = true;
    try {
      const jobs = await prisma.job.findMany({
        where: { status: "active", qualityFlags: { has: "reviewed" }, updatedAt: { gt: this.cursor } },
        orderBy: { updatedAt: "asc" },
        take: 50,
      });
      for (const job of jobs) {
        await this.onApproved(job).catch((err: unknown) => log.error({ job: job.id, error: String(err) }, "approved job matching failed"));
        this.cursor = job.updatedAt;
      }
    } catch (err) {
      log.error({ error: String(err) }, "review watcher failed");
    } finally {
      this.busy = false;
    }
  }
}

export class JoinWatcher {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly client: TelegramClient,
    private readonly onJoined: () => void,
  ) {}

  start() {
    this.timer = setInterval(() => void this.joinOne(), JOIN_CHECK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Joins the oldest pending channel, if any. */
  private async joinOne() {
    if (this.busy) return;
    this.busy = true;
    const source = await prisma.source
      .findFirst({
        where: { kind: "telegram", isActive: true, tgChannelId: null, handle: { not: null } },
        orderBy: { createdAt: "asc" },
      })
      .catch(() => null);
    try {
      if (!source) return;
      const title = await joinChannel(this.client, source.id);
      log.info({ source: source.id, title }, "joined channel added from admin");
      this.onJoined();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/FLOOD|wait/i.test(message)) {
        log.warn({ source: source?.id, error: message }, "Telegram asked to slow down; will retry later");
      } else if (source) {
        // Bad handle, private channel, not a channel...: switch it off with the reason, so it isn't retried forever.
        await prisma.source.update({ where: { id: source.id }, data: { isActive: false, notes: `Join failed: ${message}`.slice(0, 300) } });
        log.warn({ source: source.id, error: message }, "join failed; source switched off");
      }
    } finally {
      this.busy = false;
    }
  }
}
