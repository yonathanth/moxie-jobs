import {
  CV_FAIR_USE_PER_MONTH,
  limitReachedPromo,
  cvPromo,
  effectivePlan,
  employerLabel,
  isPremiumJob,
  locationText,
  packsPromo,
  premiumPromo,
  renewPromo,
  resolveCvPackPrices,
  resolveLimits,
  resolvePrices,
  upgradePromo,
  type BotPhotoMessage,
  type PromoKind,
  type Settings,
} from "@ethio/shared";
import { prisma } from "../db";
import { env } from "../env";
import { log } from "../log";
import { BotBlockedError, sendPhoto } from "./bot-api";
import { loadSettings } from "./matcher";
import { sendTimeAfterQuiet, startOfDayEat } from "./schedule";

/**
 * Marketing messages, each a picture with buttons (see @ethio/shared promos).
 * In every send slot (settings.marketing.slotsEat, default 12:30 and 19:00
 * Addis Ababa) each eligible person gets exactly one, picked by `pickPromo`:
 *
 *   paid:  plan ends within 2 days → renewal; out of CVs → packs (weekly)
 *   ended: plan ended in the last 3 days → "has ended" (once)
 *   free:  a premium job matched → premium (one a day)
 *          else take turns: upgrade (daily) · make/tailor a CV (every 3 days, while the free ones are unused)
 *               · CV packs (every 5 days, once out of CVs); the one sent longest ago goes next
 *
 * Never: in a person's first day, with alerts paused, after they blocked the
 * bot, before setup, during quiet hours, or during the beta (everyone Pro).
 * PromoLog keeps one row per person per slot.
 */

const CHECK_MS = 5 * 60_000;
/** A slot is still sent this long after its time (worker restarts, big user lists). */
const SLOT_WINDOW_MS = 3 * 60 * 60_000;
const DAY = 24 * 60 * 60_000;
const BATCH = 300;

export interface PromoInput {
  now: Date;
  /** Start of today in Addis Ababa. */
  dayStart: Date;
  paid: boolean;
  /** Paid plan ended in the last 3 days. */
  lapsed: boolean;
  free: boolean;
  planEndsAt: Date | null;
  /** Newest open premium job the plan locked in the last day, not promoted yet. */
  premiumJobId: string | null;
  /** Matches held back today by the daily limit. */
  capWaiting: number;
  /** Their free CV / free tailoring is still unused. */
  freeCvsLeft: boolean;
  /** Plan allowance, pack credits and free CVs all used up. */
  outOfCvs: boolean;
  /** What they got recently (newest first). */
  recent: { kind: string; ref: string | null; sentAt: Date }[];
}

export function pickPromo(i: PromoInput): { kind: PromoKind; ref?: string } | null {
  const last = (kind: PromoKind) => i.recent.find((r) => r.kind === kind)?.sentAt ?? null;
  const since = (kind: PromoKind, ms: number) => {
    const t = last(kind);
    return !t || i.now.getTime() - t.getTime() >= ms;
  };
  const today = (kind: PromoKind) => {
    const t = last(kind);
    return !!t && t >= i.dayStart;
  };
  const sentFor = (kind: PromoKind, ref: string) => i.recent.some((r) => r.kind === kind && r.ref === ref);

  if (i.paid) {
    if (i.planEndsAt && i.planEndsAt.getTime() - i.now.getTime() <= 2 * DAY) {
      const ref = i.planEndsAt.toISOString();
      if (!sentFor("renew_soon", ref)) return { kind: "renew_soon", ref };
    }
    if (i.outOfCvs && since("packs", 7 * DAY)) return { kind: "packs" };
    return null;
  }
  if (i.lapsed && i.planEndsAt) {
    const ref = i.planEndsAt.toISOString();
    if (!sentFor("renew_lapsed", ref)) return { kind: "renew_lapsed", ref };
  }
  if (!i.free) return null;

  if (i.premiumJobId && !today("premium")) return { kind: "premium", ref: i.premiumJobId };
  // No "cap" picture any more: each match over the limit gets its own preview, and the morning message lists them.

  const turns: PromoKind[] = [];
  if (!today("upgrade")) turns.push("upgrade");
  if (i.freeCvsLeft && since("cv", 3 * DAY)) turns.push("cv");
  if (i.outOfCvs && since("packs", 5 * DAY)) turns.push("packs");
  if (!turns.length) return null;
  // The one sent longest ago (never = first) takes this turn.
  turns.sort((a, b) => (last(a)?.getTime() ?? 0) - (last(b)?.getTime() ?? 0));
  return { kind: turns[0]! };
}

/** The slot due now ("2026-11-25 12:30" and its time), or null. */
export function dueSlot(now: Date, slotsEat: string[]): { key: string; at: Date } | null {
  const dayStart = startOfDayEat(now);
  const date = new Date(dayStart.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  let due: { key: string; at: Date } | null = null;
  for (const s of slotsEat) {
    const [h, m] = s.split(":").map(Number) as [number, number];
    const at = new Date(dayStart.getTime() + (h * 60 + m) * 60_000);
    if (at <= now && now.getTime() - at.getTime() <= SLOT_WINDOW_MS && (!due || at > due.at)) due = { key: `${date} ${s}`, at };
  }
  return due;
}

export class Promoter {
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
      if (!settings.marketing.enabled || settings.betaAllPro) return 0;
      const slot = dueSlot(now, settings.marketing.slotsEat);
      if (!slot) return 0;
      // A slot inside quiet hours is skipped.
      if (sendTimeAfterQuiet(slot.at, settings.delivery.quietFromEat, settings.delivery.quietToEat).getTime() !== slot.at.getTime()) return 0;

      const users = await prisma.user.findMany({
        where: {
          onboardedAt: { not: null },
          alertsPaused: false,
          botBlockedAt: null,
          createdAt: { lte: new Date(now.getTime() - DAY) },
          promoLogs: { none: { slot: slot.key } },
        },
        take: BATCH,
      });
      let sent = 0;
      for (const user of users) {
        try {
          if (await this.sendOne(user, slot.key, settings, now)) sent++;
        } catch (err) {
          log.warn({ user: user.id, error: String(err) }, "promo failed");
        }
      }
      if (sent) log.info({ slot: slot.key, sent }, "promos sent");
      return sent;
    } catch (err) {
      log.error({ error: String(err) }, "promo run failed");
      return 0;
    } finally {
      this.busy = false;
    }
  }

  private async sendOne(user: Awaited<ReturnType<typeof prisma.user.findMany>>[number], slot: string, settings: Settings, now: Date): Promise<boolean> {
    const input = await promoInput(user, settings, now);
    const pick = pickPromo(input);
    // Claim the slot first (also when nothing fits), so a restart can't double-send.
    await prisma.promoLog.create({ data: { userId: user.id, kind: pick?.kind ?? "none", slot, ref: pick?.ref ?? null } });
    if (!pick) return false;

    const message = await buildPromo(pick, user, settings);
    if (!message) return false;
    const base = env().WEB_APP_URL.startsWith("https://") ? env().WEB_APP_URL : null;
    try {
      await sendPhoto(user.telegramId, message.image, message.caption, { buttons: base ? toButtons(message, base) : undefined });
      return true;
    } catch (err) {
      if (err instanceof BotBlockedError) {
        await prisma.user.update({ where: { id: user.id }, data: { botBlockedAt: new Date() } });
        return false;
      }
      throw err;
    }
  }
}

export function toButtons(m: BotPhotoMessage, base: string) {
  return m.buttons.map((row) => row.map((b) => ({ text: b.text, web_app: { url: new URL(b.path, base).toString() } })));
}

type UserRow = Awaited<ReturnType<typeof prisma.user.findMany>>[number];

async function promoInput(user: UserRow, settings: Settings, now: Date): Promise<PromoInput> {
  const dayStart = startOfDayEat(now);
  const plan = effectivePlan(user, settings, now);
  const limits = resolveLimits(plan, settings);
  const boughtPlan = user.plan === "pro" || user.plan === "career";
  const ends = user.planExpiresAt;
  const paid = boughtPlan && !!ends && ends > now;
  const lapsed = boughtPlan && !!ends && ends <= now && now.getTime() - ends.getTime() <= 3 * DAY;
  const month = new Date(now.getTime() - 30 * DAY);

  const [recent, premium, capWaiting, cvCount, tasterUsed, planNew, planTailor] = await Promise.all([
    prisma.promoLog.findMany({ where: { userId: user.id, sentAt: { gte: new Date(now.getTime() - 14 * DAY) } }, orderBy: { sentAt: "desc" } }),
    limits.premiumJobs
      ? Promise.resolve(null)
      : prisma.delivery.findFirst({
          where: {
            userId: user.id,
            status: "locked",
            createdAt: { gte: new Date(now.getTime() - DAY) },
            job: { status: "active", OR: [{ deadline: null }, { deadline: { gt: now } }] },
          },
          orderBy: { createdAt: "desc" },
          select: { jobId: true },
        }),
    prisma.delivery.count({
      where: { userId: user.id, status: "skipped", error: "daily_cap", createdAt: { gte: dayStart }, job: { status: "active" } },
    }),
    prisma.cvDocument.count({ where: { userId: user.id } }),
    prisma.cvDocument.count({ where: { userId: user.id, charge: "taster" } }).then((n) => n > 0),
    prisma.cvDocument.count({ where: { userId: user.id, charge: "plan", flow: { in: ["create", "improve"] }, OR: [{ createdAt: { gte: month } }, { unlockedAt: { gte: month } }] } }),
    prisma.cvDocument.count({ where: { userId: user.id, charge: "plan", flow: "tailor", OR: [{ createdAt: { gte: month } }, { unlockedAt: { gte: month } }] } }),
  ]);
  const left = (perMonth: number | null, used: number) => (perMonth === null ? used < CV_FAIR_USE_PER_MONTH : used < perMonth);
  const premiumJobId = premium && !recent.some((r) => r.kind === "premium" && r.ref === premium.jobId) ? premium.jobId : null;

  return {
    now,
    dayStart,
    paid,
    lapsed,
    free: plan === "free",
    planEndsAt: ends,
    premiumJobId,
    capWaiting,
    freeCvsLeft: cvCount === 0 || !tasterUsed,
    outOfCvs:
      cvCount > 0 &&
      tasterUsed &&
      user.cvNewCredits + user.cvTailorCredits === 0 &&
      !left(limits.cvNewPerMonth, planNew) &&
      !left(limits.cvTailorPerMonth, planTailor),
    recent,
  };
}

async function buildPromo(pick: { kind: PromoKind; ref?: string }, user: UserRow, settings: Settings): Promise<BotPhotoMessage | null> {
  switch (pick.kind) {
    case "upgrade":
      return upgradePromo(resolvePrices(settings).pro.month);
    case "cv":
      return cvPromo();
    case "packs":
      return packsPromo(resolveCvPackPrices(settings));
    case "cap":
      return limitReachedPromo(resolveLimits("free", settings).dailyJobCap ?? 5);
    case "premium": {
      const job = pick.ref ? await prisma.job.findUnique({ where: { id: pick.ref } }) : null;
      if (!job || !isPremiumJob(job)) return null;
      return premiumPromo({
        id: job.id,
        title: job.title,
        kind: employerLabel(job.employerType) ?? (job.isOverseas ? "Abroad" : null),
        location: locationText(job),
        deadline: job.deadline,
      });
    }
    case "renew_soon":
    case "renew_lapsed":
      return user.planExpiresAt ? renewPromo(user.plan === "career" ? "career" : "pro", user.planExpiresAt, pick.kind === "renew_lapsed") : null;
  }
}
