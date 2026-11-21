import { effectivePlan, premiumBucket, resolveLimits } from "@ethio/shared";
import { prisma } from "../db";
import { env } from "../env";
import { log } from "../log";
import { BotBlockedError, sendMessage } from "./bot-api";
import { loadSettings } from "./matcher";
import { startOfDayEat, todayAtEat } from "./schedule";

/**
 * Once a day (settings.delivery.teaserHourEat), each free user whose matches
 * were held back gets ONE summary: matches over the daily limit ("waiting in
 * your feed") and premium jobs their plan doesn't include (NGO, UN/AU/embassy,
 * foreign company, abroad), with an upgrade button. Nothing held back: nothing sent.
 * UserPreferences.lastBatchAt records the last summary (one per day).
 */

const CHECK_MS = 10 * 60_000;
/** Held-back matches older than this aren't counted ("today", allowing for last evening). */
const LOOKBACK_MS = 36 * 60 * 60_000;

export interface DigestCounts {
  /** Matches skipped by the daily alert limit. */
  waiting: number;
  dailyCap: number | null;
  ngo: number;
  intl: number;
  foreign: number;
  overseas: number;
}

const BUCKET_LABEL: Record<"ngo" | "intl" | "foreign" | "overseas", [string, string]> = {
  ngo: ["NGO job", "NGO jobs"],
  intl: ["UN, AU or embassy job", "UN, AU & embassy jobs"],
  foreign: ["international company job", "international company jobs"],
  overseas: ["job abroad", "jobs abroad"],
};

/** The daily summary. Pure, unit-tested. Null when nothing was held back. */
export function digestText(c: DigestCounts, pro: { premiumJobs: boolean; dailyJobCap: number | null }): string | null {
  const premium = c.ngo + c.intl + c.foreign + c.overseas;
  if (!premium && !c.waiting) return null;
  const lines = ["<b>Today's summary</b>", ""];
  if (c.waiting) {
    const limit = c.dailyCap ? `your ${c.dailyCap} free alerts` : "your free alerts";
    lines.push(
      `You've had ${limit} today. <b>${c.waiting} more ${c.waiting === 1 ? "match is" : "matches are"} waiting</b> in your feed.`,
    );
  }
  if (premium) {
    const parts = (Object.keys(BUCKET_LABEL) as (keyof typeof BUCKET_LABEL)[])
      .filter((k) => c[k] > 0)
      .map((k) => `${c[k]} ${BUCKET_LABEL[k][c[k] === 1 ? 0 : 1]}`);
    if (c.waiting) lines.push("");
    lines.push(`<b>${premium} premium ${premium === 1 ? "job" : "jobs"}</b> also matched you: ${parts.join(", ")}.`);
  }
  const perks = [pro.dailyJobCap === null ? "with no daily limit" : `up to ${pro.dailyJobCap} a day`, pro.premiumJobs ? "including NGO, international and overseas jobs" : null].filter(Boolean);
  lines.push("", `Pro sends every match the moment it's posted, ${perks.join(", ")}.`);
  return lines.join("\n");
}

export class Teaser {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  start() {
    void this.run();
    this.timer = setInterval(() => void this.run(), CHECK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try {
      const settings = await loadSettings();
      if (now < todayAtEat(now, settings.delivery.teaserHourEat)) return 0;

      const since = new Date(now.getTime() - LOOKBACK_MS);
      const held = await prisma.delivery.findMany({
        where: {
          createdAt: { gte: since },
          OR: [{ status: "locked" }, { status: "skipped", error: "daily_cap" }],
        },
        select: { id: true, userId: true, status: true, job: { select: { employerType: true, isOverseas: true, status: true, deadline: true } } },
      });
      const byUser = new Map<string, typeof held>();
      for (const d of held) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
      if (!byUser.size) return 0;

      const dayStart = startOfDayEat(now);
      const users = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, include: { preferences: true } });
      const base = env().WEB_APP_URL.startsWith("https://") ? env().WEB_APP_URL : null;

      let sent = 0;
      for (const user of users) {
        if (!user.preferences || user.alertsPaused || user.botBlockedAt) continue;
        if (user.preferences.lastBatchAt && user.preferences.lastBatchAt >= dayStart) continue; // one per day
        const limits = resolveLimits(effectivePlan(user, settings, now), settings);
        // Upgraded since: the backfill unlocks these instead.
        if (limits.premiumJobs && limits.dailyJobCap === null) continue;

        const open = byUser.get(user.id)!.filter((d) => d.job.status === "active" && (!d.job.deadline || d.job.deadline > now));
        const counts: DigestCounts = { waiting: 0, dailyCap: limits.dailyJobCap, ngo: 0, intl: 0, foreign: 0, overseas: 0 };
        for (const d of open) {
          if (d.status === "skipped") counts.waiting++;
          else {
            const bucket = premiumBucket(d.job);
            if (bucket) counts[bucket]++;
          }
        }
        const text = digestText(counts, resolveLimits("pro", settings));
        if (!text) continue;
        try {
          await sendMessage(user.telegramId, text, {
            buttons: base
              ? [
                  [
                    ...(counts.waiting ? [{ text: "Open my feed", web_app: { url: new URL("/app/jobs", base).toString() } }] : []),
                    { text: "See plans", web_app: { url: new URL("/app/plans", base).toString() } },
                  ],
                ]
              : undefined,
          });
        } catch (err) {
          if (err instanceof BotBlockedError) {
            await prisma.user.update({ where: { id: user.id }, data: { botBlockedAt: new Date() } });
            continue;
          }
          throw err;
        }
        // Raw SQL on purpose: a Prisma update would bump updatedAt, which the backfill watcher reads as a preferences save.
        await prisma.$executeRaw`UPDATE "UserPreferences" SET "lastBatchAt" = ${now} WHERE "userId" = ${user.id}`;
        const lockedIds = byUser.get(user.id)!.filter((d) => d.status === "locked").map((d) => d.id);
        if (lockedIds.length) await prisma.delivery.updateMany({ where: { id: { in: lockedIds } }, data: { status: "teased", sentAt: now } });
        sent++;
      }
      if (sent) log.info({ users: sent }, "daily summaries sent");
      return sent;
    } catch (err) {
      log.error({ error: String(err) }, "daily summary run failed");
      return 0;
    } finally {
      this.busy = false;
    }
  }
}
