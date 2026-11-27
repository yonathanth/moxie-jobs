import { prisma } from "../db";
import { env } from "../env";
import { log } from "../log";
import type { Job } from "@ethio/db";
import { BotBlockedError, ChatNotFoundError, sendMessage, sendPhoto } from "./bot-api";
import { buildCard } from "./card";
import { loadSettings } from "./matcher";
import { loadTaxonomy } from "../pipeline/taxonomy";
import { effectivePlan, employerLabel, kindMatchPreview, locationText, overLimitPreview, resolveLimits, type PreviewJob, type PreviewLinks } from "@ethio/shared";
import { startOfDayEat } from "./schedule";

const TICK_MS = 5_000;
const CLAIM_LIMIT = 100;
const PER_CHAT_GAP_MS = 400;

/** Where previews link: Mini App buttons need https; links in the text need the bot's username. */
export function previewLinks(): PreviewLinks {
  const e = env();
  return {
    app: e.WEB_APP_URL.startsWith("https://") ? e.WEB_APP_URL : null,
    bot: e.TELEGRAM_BOT_USERNAME ? `https://t.me/${e.TELEGRAM_BOT_USERNAME}` : null,
  };
}

/** What a preview may show: never the employer's name or how to apply. */
export function previewJob(job: Job): PreviewJob {
  return {
    id: job.id,
    title: job.title,
    employerLabel: employerLabel(job.employerType) ?? (job.isOverseas ? "Abroad" : null),
    location: locationText(job),
    deadline: job.deadline,
  };
}

interface Claimed {
  id: string;
  userId: string;
  jobId: string;
  mode: string;
}

/**
 * Sends due Deliveries, one card each, right away. Plans with a daily cap
 * (free) get at most N full cards per Addis Ababa day; the rest get a short preview
 * (skipped/daily_cap, opens in the app tomorrow). Locked kinds of jobs get a picture preview (teased).
 * Rows are claimed with SKIP LOCKED so a restart never double-sends.
 */
export class Sender {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private stopped = false;

  start() {
    this.stopped = false;
    this.kick();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    while (this.busy) await new Promise((r) => setTimeout(r, 200));
  }

  kick() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.tick();
  }

  private async tick() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      await prisma.$executeRaw`
        UPDATE "Delivery" SET status = 'pending'
        WHERE status = 'sending' AND "scheduledFor" < now() - interval '10 minutes'`;
      const claimed = await prisma.$queryRaw<Claimed[]>`
        UPDATE "Delivery" SET status = 'sending'
        WHERE id IN (
          SELECT id FROM "Delivery"
          WHERE status = 'pending' AND "scheduledFor" <= now()
          ORDER BY "scheduledFor" ASC
          LIMIT ${CLAIM_LIMIT}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, "userId", "jobId", mode`;
      if (claimed.length) await this.sendAll(claimed);
    } catch (err) {
      log.error({ err: String(err) }, "sender tick failed");
    } finally {
      this.busy = false;
      if (!this.stopped && !this.timer) this.timer = setTimeout(() => this.kick(), TICK_MS);
    }
  }

  private async sendAll(claimed: Claimed[]) {
    const settings = await loadSettings();
    const byUser = new Map<string, Claimed[]>();
    for (const d of claimed) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);

    const [users, jobs] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } } }),
      prisma.job.findMany({ where: { id: { in: [...new Set(claimed.map((d) => d.jobId))] } } }),
    ]);
    const sources = new Map(
      (await prisma.source.findMany({ where: { id: { in: [...new Set(jobs.map((j) => j.primarySourceId))] } }, select: { id: true, title: true } })).map(
        (s) => [s.id, s.title],
      ),
    );
    const usersById = new Map(users.map((u) => [u.id, u]));
    const jobsById = new Map(jobs.map((j) => [j.id, j]));
    const now = new Date();
    const { prompt: taxonomy } = await loadTaxonomy();
    const fieldNames = new Map(taxonomy.fields.map((f) => [f.id, f.name]));

    for (const [userId, deliveries] of byUser) {
      const user = usersById.get(userId);
      if (!user || user.botBlockedAt || user.alertsPaused) {
        await this.finish(deliveries.map((d) => d.id), "skipped", user ? "paused_or_blocked" : "no_user");
        continue;
      }

      // Drop jobs that closed or were hidden while queued.
      const live = deliveries.filter((d) => {
        const job = jobsById.get(d.jobId);
        return job && job.status === "active" && (!job.deadline || job.deadline > now);
      });
      const dead = deliveries.filter((d) => !live.includes(d));
      if (dead.length) await this.finish(dead.map((d) => d.id), "skipped", "job_closed");

      // Daily cap (free plan): new-job alerts sent today in Addis Ababa time. The catch-up after
      // setting preferences (mode "backfill", already a short list) doesn't use it up and isn't capped:
      // someone who signs up at night still gets their new alerts the next day.
      const limits = resolveLimits(effectivePlan(user, settings, now), settings);
      let budget = Infinity;
      if (limits.dailyJobCap !== null) {
        const sentToday = await prisma.delivery.count({ where: { userId, status: "sent", mode: { not: "backfill" }, sentAt: { gte: startOfDayEat(now) } } });
        budget = Math.max(0, limits.dailyJobCap - sentToday);
      }
      // Most urgent first, then newest, so a capped day keeps the best ones.
      const ordered = [...live].sort((a, b) => {
        const ja = jobsById.get(a.jobId)!;
        const jb = jobsById.get(b.jobId)!;
        const da = ja.deadline?.getTime() ?? Infinity;
        const db = jb.deadline?.getTime() ?? Infinity;
        return da - db || jb.firstSeenAt.getTime() - ja.firstSeenAt.getTime();
      });
      // Kinds of jobs the plan doesn't include (NGO, UN/AU/embassy, international company, abroad): a picture
      // preview. If they upgraded since it was queued, it goes out as a normal card instead.
      const previews = ordered.filter((d) => d.mode === "locked" && !limits.premiumJobs);
      const rest = ordered.filter((d) => !previews.includes(d));
      const catchUp = rest.filter((d) => d.mode === "backfill");
      const alerts = rest.filter((d) => d.mode !== "backfill");
      const allowed = alerts.slice(0, Number.isFinite(budget) ? budget : alerts.length);
      const cards = [...catchUp, ...allowed];
      // Over the daily limit: a short preview (no employer, no how to apply); the job opens in the app tomorrow.
      const over = alerts.slice(allowed.length);

      try {
        for (const d of cards) await this.sendCard(user.telegramId, d, jobsById.get(d.jobId)!, sources, fieldNames);
        for (const d of previews) await this.sendKindPreview(user.telegramId, d, jobsById.get(d.jobId)!);
        for (const d of over) await this.sendOverLimitPreview(user.telegramId, d, jobsById.get(d.jobId)!, limits.dailyJobCap ?? 5);
      } catch (err) {
        if (err instanceof BotBlockedError) {
          await prisma.user.update({ where: { id: userId }, data: { botBlockedAt: new Date() } });
          await prisma.delivery.updateMany({ where: { userId, status: { in: ["sending", "pending"] } }, data: { status: "skipped", error: "bot_blocked" } });
          log.info({ user: userId }, "user blocked the bot; deliveries skipped");
        } else if (err instanceof ChatNotFoundError) {
          // Can't message them until they allow it in the Mini App (or press Start); kept as matches, and re-sent
          // by the backfill once they do (the API touches their preferences then).
          await prisma.delivery.updateMany({ where: { userId, status: { in: ["sending", "pending"] } }, data: { status: "failed", error: "chat_not_found" } });
          log.info({ user: userId }, "bot can't message this user yet (chat not found); deliveries held");
        } else {
          const ids = deliveries.map((d) => d.id);
          await prisma.delivery.updateMany({ where: { id: { in: ids }, status: "sending" }, data: { status: "failed", error: String(err).slice(0, 500) } });
          log.error({ user: userId, err: String(err) }, "delivery failed");
        }
      }
    }
  }

  private async sendCard(
    chatId: bigint,
    delivery: Claimed,
    job: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>,
    sources: Map<string, string>,
    fieldNames: Map<string, string>,
  ) {
    const card = buildCard(job, {
      sourceTitle: sources.get(job.primarySourceId) ?? "Telegram",
      deliveryId: delivery.id,
      fieldNames: job.fieldOfStudyIds.filter((id) => id !== "any_field").map((id) => fieldNames.get(id) ?? "").filter(Boolean),
      webAppUrl: env().WEB_APP_URL,
      publicApiUrl: env().PUBLIC_API_URL,
    });
    const messageId = await sendMessage(chatId, card.text, { buttons: card.buttons });
    await prisma.delivery.update({ where: { id: delivery.id }, data: { status: "sent", sentAt: new Date(), tgMessageId: BigInt(messageId) } });
    await new Promise((r) => setTimeout(r, PER_CHAT_GAP_MS));
  }

  /** A locked kind of job: picture preview with See job / Get Pro. Stays locked in the feed ("teased"). */
  private async sendKindPreview(chatId: bigint, delivery: Claimed, job: Job) {
    const msg = kindMatchPreview({ ...previewJob(job), employerType: job.employerType, isOverseas: job.isOverseas }, previewLinks());
    const messageId = await sendPhoto(chatId, msg.image, msg.caption, { buttons: msg.buttons });
    await prisma.delivery.update({ where: { id: delivery.id }, data: { status: "teased", sentAt: new Date(), tgMessageId: BigInt(messageId) } });
    await new Promise((r) => setTimeout(r, PER_CHAT_GAP_MS));
  }

  /** Over today's free limit: a text preview. Recorded as skipped/daily_cap (the feed's "opens tomorrow"), with the message id. */
  private async sendOverLimitPreview(chatId: bigint, delivery: Claimed, job: Job, dailyCap: number) {
    const msg = overLimitPreview(previewJob(job), dailyCap, previewLinks());
    const messageId = await sendMessage(chatId, msg.text, { buttons: msg.buttons });
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: "skipped", error: "daily_cap", sentAt: new Date(), tgMessageId: BigInt(messageId) },
    });
    await new Promise((r) => setTimeout(r, PER_CHAT_GAP_MS));
  }

  private async finish(ids: string[], status: "skipped" | "failed", error: string) {
    if (ids.length) await prisma.delivery.updateMany({ where: { id: { in: ids } }, data: { status, error } });
  }
}
