import { log } from "../log";
import type { PostProcessor } from "./process";
import { claimPosts, releaseStale } from "./queue";

const IDLE_POLL_MS = 5_000;

/**
 * Pulls RawPosts off the queue and processes up to `concurrency` at a time.
 * The listener calls kick() after storing a post so new jobs start immediately;
 * polling is the backup (and picks up retries).
 */
export class Pipeline {
  private running = 0;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;
  private pumping = false;
  private lastStaleCheck = 0;

  constructor(
    private readonly processor: PostProcessor,
    private readonly concurrency: number,
  ) {}

  start() {
    this.stopped = false;
    this.kick();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    while (this.running > 0) await new Promise((r) => setTimeout(r, 200));
  }

  kick() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.pump();
  }

  private async pump() {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      if (Date.now() - this.lastStaleCheck > 60_000) {
        this.lastStaleCheck = Date.now();
        const released = await releaseStale();
        if (released) log.warn({ released }, "released stale posts");
      }
      const free = this.concurrency - this.running;
      if (free > 0) {
        const ids = await claimPosts(free);
        for (const id of ids) {
          this.running++;
          void this.processor.process(id).finally(() => {
            this.running--;
            this.kick();
          });
        }
      }
    } catch (err) {
      log.error({ err: String(err) }, "pipeline pump failed");
    } finally {
      this.pumping = false;
      if (!this.stopped && !this.timer) this.timer = setTimeout(() => this.kick(), IDLE_POLL_MS);
    }
  }
}
