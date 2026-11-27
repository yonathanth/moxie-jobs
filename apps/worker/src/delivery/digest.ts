import { effectivePlan, isPremiumJob, jobKindLabel, missedDigest, MISSED_DIGEST_MAX, resolveLimits } from "@ethio/shared";
import { prisma } from "../db";
import { log } from "../log";
import { BotBlockedError, ChatNotFoundError, sendPhoto } from "./bot-api";
import { loadSettings } from "./matcher";
import { startOfDayEat, todayAtEat } from "./schedule";
import { previewLinks } from "./sender";

/**
 * Every morning (settings.delivery.digestHourEat, default 8:00 Addis Ababa) each free user gets ONE picture
 * message listing the jobs that matched them yesterday but weren't sent in full: over the daily limit, or a
 * kind of job the plan doesn't include. At most 10 (title and employer; the kind of employer, never the name,
 * for jobs the plan locks), with See jobs | Subscribe. Still-open jobs only; nothing missed, nothing sent.
 * UserPreferences.lastBatchAt records the last one (one per day).
 */

const CHECK_MS = 10 * 60_000;
const DAY_MS = 24 * 3_600_000;
/** Sent until this long after the hour (worker restarts); later than that waits for tomorrow. */
const WINDOW_MS = 4 * 3_600_000;

export class MissedDigest {
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
      const at = todayAtEat(now, settings.delivery.digestHourEat);
      if (now < at || now.getTime() - at.getTime() > WINDOW_MS) return 0;

      const today = startOfDayEat(now);
      const yesterday = new Date(today.getTime() - DAY_MS);
      const missed = await prisma.delivery.findMany({
        where: {
          createdAt: { gte: yesterday, lt: today },
          OR: [{ status: { in: ["locked", "teased"] } }, { status: "skipped", error: "daily_cap" }],
          job: { status: "active", OR: [{ deadline: null }, { deadline: { gt: now } }] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          userId: true,
          job: { select: { title: true, company: true, employerType: true, isOverseas: true, deadline: true } },
        },
      });
      const byUser = new Map<string, (typeof missed)[number]["job"][]>();
      for (const d of missed) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d.job]);
      if (!byUser.size) return 0;

      const users = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, include: { preferences: true } });
      const links = previewLinks();
      let sent = 0;
      for (const user of users) {
        if (!user.preferences || user.alertsPaused || user.botBlockedAt) continue;
        if (user.preferences.lastBatchAt && user.preferences.lastBatchAt >= today) continue; // one per day
        const limits = resolveLimits(effectivePlan(user, settings, now), settings);
        // Upgraded since: nothing is held back any more.
        if (limits.premiumJobs && limits.dailyJobCap === null) continue;

        const jobs = byUser.get(user.id)!;
        // Soonest deadline first: the ones still worth applying to.
        jobs.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
        const items = jobs.slice(0, MISSED_DIGEST_MAX).map((j) => ({
          title: j.title,
          who: isPremiumJob(j) && !limits.premiumJobs ? (jobKindLabel(j) ?? null) : j.company,
        }));
        const msg = missedDigest(items, jobs.length, limits.dailyJobCap, links);
        if (!msg) continue;
        try {
          await sendPhoto(user.telegramId, msg.image, msg.caption, { buttons: msg.buttons });
        } catch (err) {
          if (err instanceof BotBlockedError) {
            await prisma.user.update({ where: { id: user.id }, data: { botBlockedAt: new Date() } });
            continue;
          }
          if (err instanceof ChatNotFoundError) continue;
          log.error({ user: user.id, err: String(err) }, "missed-jobs message failed");
          continue;
        }
        // Raw SQL on purpose: a Prisma update would bump updatedAt, which the backfill watcher reads as a preferences save.
        await prisma.$executeRaw`UPDATE "UserPreferences" SET "lastBatchAt" = ${now} WHERE "userId" = ${user.id}`;
        sent++;
      }
      if (sent) log.info({ users: sent }, "missed-jobs messages sent");
      return sent;
    } catch (err) {
      log.error({ error: String(err) }, "missed-jobs run failed");
      return 0;
    } finally {
      this.busy = false;
    }
  }
}
