import type { Job, User, UserPreferences } from "@ethio/db";
import { effectivePlan, isPremiumJob, isUnpaidJob, parseSettings, resolveLimits, type PlanLimits, type Settings } from "@ethio/shared";
import { prisma } from "../db";
import { log } from "../log";
import { loadTaxonomy } from "../pipeline/taxonomy";
import { isThinJob, matchJob, type MatchCandidate } from "./match";
import { sendTimeAfterQuiet } from "./schedule";

let settingsCache: { at: number; value: Settings } | null = null;

export async function loadSettings(): Promise<Settings> {
  if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.value;
  const { settings, error } = parseSettings(await prisma.setting.findMany());
  if (error) log.error({ error }, "invalid settings in DB, using defaults");
  settingsCache = { at: Date.now(), value: settings };
  return settings;
}

type UserWithPrefs = User & {
  preferences: UserPreferences | null;
  professions: { professionId: string }[];
  functions: { functionId: string }[];
};

const userInclude = {
  preferences: true,
  professions: { orderBy: { sortOrder: "asc" as const }, select: { professionId: true } },
  functions: { select: { functionId: true } },
};

function toCandidate(user: UserWithPrefs): MatchCandidate {
  const p = user.preferences!;
  return {
    professionIds: user.professions.map((x) => x.professionId),
    functionIds: user.functions.map((x) => x.functionId),
    fieldOfStudyIds: p.fieldOfStudyIds,
    educationLevel: p.educationLevel,
    experienceBand: p.experienceBand,
    locationIds: p.locationIds,
    remoteOk: p.remoteOk,
    employmentTypes: p.employmentTypes,
    gender: p.gender,
    overseasOk: p.overseasOk,
    salaryMin: p.salaryMin,
  };
}


/**
 * How a matched job reaches a user: sent now, or "locked" when it's a premium
 * job (NGO, UN/AU/embassy, foreign company, overseas) their plan doesn't
 * include. Locked rows feed the once-a-day teaser and unlock on upgrade.
 */
export function deliveryState(job: { employerType: string | null; isOverseas: boolean }, limits: PlanLimits) {
  return isPremiumJob(job) && !limits.premiumJobs
    ? ({ status: "locked", mode: "locked" } as const)
    : ({ status: "pending", mode: "instant" } as const);
}

/** How far back a backfill looks for still-open jobs. */
export const BACKFILL_DAYS = 7;
/** Cards sent per backfill (there's no in-app feed yet to hold the rest). */
export const BACKFILL_MAX_CARDS = 10;

/**
 * Queues already-known open jobs for one user, after they onboard, change
 * preferences or upgrade (the API touches preferences on activation). New-job
 * matching only reaches users who exist when a job arrives. Sends the top
 * BACKFILL_MAX_CARDS right away; premium jobs the plan lacks are stored locked.
 * After an upgrade, previously locked jobs count as not yet sent. Returns cards queued.
 */
export async function backfillUser(userId: string, now = new Date()): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude });
  if (!user?.preferences || !user.onboardedAt || user.alertsPaused || user.botBlockedAt) return 0;
  const candidate = toCandidate(user);
  const settings = await loadSettings();
  const limits = resolveLimits(effectivePlan(user, settings, now), settings);

  const professions = candidate.professionIds.slice(0, limits.maxProfessions);
  const functions = candidate.functionIds.slice(0, limits.maxFunctions);
  const fields = candidate.fieldOfStudyIds.slice(0, limits.maxFieldsOfStudy);
  const target = [
    ...(professions.length ? [{ professionId: { in: professions } }] : []),
    ...(functions.length ? [{ functionId: { in: functions } }] : []),
    ...(fields.length ? [{ fieldOfStudyIds: { hasSome: fields } }] : []),
  ];
  if (!target.length) return 0;

  const jobs = await prisma.job.findMany({
    where: {
      status: "active",
      OR: [{ deadline: null }, { deadline: { gt: now } }],
      firstSeenAt: { gte: new Date(now.getTime() - BACKFILL_DAYS * 24 * 3_600_000) },
      AND: [{ OR: target }],
    },
    orderBy: { firstSeenAt: "desc" },
    take: 300,
  });
  const existing = new Map(
    (
      await prisma.delivery.findMany({ where: { userId, jobId: { in: jobs.map((j) => j.id) } }, select: { id: true, jobId: true, status: true } })
    ).map((d) => [d.jobId, d]),
  );
  const { ids: taxonomy } = await loadTaxonomy();
  const isOpenFor = (jobId: string) => {
    const d = existing.get(jobId);
    // Locked/teased rows are fair game again once the plan includes premium jobs.
    return !d || (limits.premiumJobs && (d.status === "locked" || d.status === "teased"));
  };
  const excludeUnpaid = settings.unpaidJobs === "exclude";
  const matched = jobs.filter(
    (job) => isOpenFor(job.id) && !isThinJob(job) && !(excludeUnpaid && isUnpaidJob(job)) && matchJob(job, candidate, limits, taxonomy.professionToFunction).ok,
  );
  // Soonest deadline first, then newest. Unqueued matches stay eligible for a later backfill.
  matched.sort(
    (a, b) =>
      (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || b.firstSeenAt.getTime() - a.firstSeenAt.getTime(),
  );

  const cards = matched.filter((j) => deliveryState(j, limits).status === "pending").slice(0, BACKFILL_MAX_CARDS);
  const locked = matched.filter((j) => deliveryState(j, limits).status === "locked" && !existing.has(j.id));
  const unlock = cards.filter((j) => existing.has(j.id)).map((j) => existing.get(j.id)!.id);
  const fresh = cards.filter((j) => !existing.has(j.id));

  if (unlock.length) {
    await prisma.delivery.updateMany({
      where: { id: { in: unlock } },
      data: { status: "pending", mode: "backfill", scheduledFor: now, error: null },
    });
  }
  const rows = [
    ...fresh.map((job) => ({ userId, jobId: job.id, status: "pending", mode: "backfill", scheduledFor: now })),
    ...locked.map((job) => ({ userId, jobId: job.id, status: "locked", mode: "locked", scheduledFor: now })),
  ];
  const { count } = rows.length ? await prisma.delivery.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  const queued = unlock.length + fresh.length;
  if (queued || locked.length) {
    log.info({ user: userId, scanned: jobs.length, matched: matched.length, queued, unlocked: unlock.length, locked: locked.length, inserted: count }, "backfill queued");
  }
  return queued;
}

/** Finds users for a new job and queues a Delivery for each. Returns the number queued to send now. */
export async function matchAndQueue(job: Job, now = new Date()): Promise<number> {
  const settings = await loadSettings();
  if (job.status !== "active") return 0;
  if (settings.unpaidJobs === "exclude" && isUnpaidJob(job)) return 0;
  if (isThinJob(job)) {
    log.info({ job: job.id, title: job.title }, "job too thin to send");
    return 0;
  }
  if (job.deadline && job.deadline <= now) return 0;
  if (now.getTime() - job.firstSeenAt.getTime() > settings.delivery.maxJobAgeHours * 3_600_000) return 0;

  const fields = job.fieldOfStudyIds.filter((f) => f !== "any_field");
  const candidates = await prisma.user.findMany({
    where: {
      onboardedAt: { not: null },
      alertsPaused: false,
      botBlockedAt: null,
      preferences: { isNot: null },
      OR: [
        ...(job.professionId ? [{ professions: { some: { professionId: job.professionId } } }] : []),
        ...(job.functionId ? [{ functions: { some: { functionId: job.functionId } } }] : []),
        ...(fields.length ? [{ preferences: { fieldOfStudyIds: { hasSome: fields } } }] : []),
      ],
    },
    include: userInclude,
  });
  if (!candidates.length) return 0;

  const { ids: taxonomy } = await loadTaxonomy();
  // New-job alerts respect quiet hours; backfills (the user just acted) don't.
  const sendAt = sendTimeAfterQuiet(now, settings.delivery.quietFromEat, settings.delivery.quietToEat);
  const rows: { userId: string; jobId: string; status: string; mode: string; scheduledFor: Date }[] = [];
  for (const user of candidates) {
    const limits = resolveLimits(effectivePlan(user, settings, now), settings);
    if (!matchJob(job, toCandidate(user), limits, taxonomy.professionToFunction).ok) continue;
    rows.push({ userId: user.id, jobId: job.id, ...deliveryState(job, limits), scheduledFor: sendAt });
  }

  if (!rows.length) return 0;
  // (userId, jobId) is unique: a job never reaches the same user twice.
  const { count } = await prisma.delivery.createMany({ data: rows, skipDuplicates: true });
  const toSend = rows.filter((r) => r.status === "pending").length;
  log.info({ job: job.id, title: job.title, candidates: candidates.length, inserted: count, toSend, locked: rows.length - toSend }, "job matched");
  return toSend;
}
