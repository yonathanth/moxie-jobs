import { z } from "zod";
import { BILLING_PERIODS, PAID_PLANS, PLANS, type Plan } from "./enums";
import { CV_PACK_CONTENTS, CV_PACKS, DEFAULT_CV_PACK_PRICES, DEFAULT_CV_PRICES, DEFAULT_PLAN_LIMITS, DEFAULT_PRICES, MAX_LIMITS, type CvProduct, type PlanLimits, type PriceTable } from "./plans";

/**
 * Admin-editable platform settings (Setting table, one row per key). Every key
 * has a safe default, so a missing or bad row never breaks the API or worker.
 */
const priceRow = z.object(Object.fromEntries(BILLING_PERIODS.map((p) => [p, z.number().int().min(1).max(100_000)])) as Record<
  (typeof BILLING_PERIODS)[number],
  z.ZodNumber
>);

export const settingsSchema = z.object({
  /** During the beta every user gets Pro limits. */
  betaAllPro: z.boolean().default(true),
  planLimits: z.object(Object.fromEntries(PLANS.map((p) => [p, z.custom<Partial<PlanLimits>>().optional()]))).default({}),
  /** ETB per period. Partial overrides are merged over DEFAULT_PRICES. */
  prices: z
    .object(Object.fromEntries(PAID_PLANS.map((p) => [p, priceRow.partial().optional()])))
    .default({}),
  delivery: z
    .object({
      /** Don't alert on jobs first posted longer ago than this (e.g. catch-up backfill). */
      maxJobAgeHours: z.number().int().min(1).max(168).default(48),
      /** Hour (Addis Ababa time) of the once-a-day "premium jobs matched" teaser for free users. */
      teaserHourEat: z.number().int().min(0).max(23).default(18),
      /** Quiet hours (Addis Ababa time): alerts matched from quietFromEat until quietToEat wait until quietToEat. Equal = off. */
      quietFromEat: z.number().int().min(0).max(23).default(22),
      quietToEat: z.number().int().min(0).max(23).default(7),
    })
    .default({ maxJobAgeHours: 48, teaserHourEat: 18, quietFromEat: 22, quietToEat: 7 }),
  /** Marketing messages (pictures, worker `delivery/promo.ts`): one per user in each send slot (Addis Ababa "HH:MM"). */
  marketing: z
    .object({
      enabled: z.boolean().default(true),
      slotsEat: z.array(z.string().regex(/^([01]d|2[0-3]):[0-5]d$/)).max(4).default(["12:30", "19:00"]),
    })
    .default({ enabled: true, slotsEat: ["12:30", "19:00"] }),
  /** One-time CV prices (ETB) and how many unpaid (locked) CVs a person may have at once. */
  /** Deprecated (CVs aren't sold one by one any more); kept so old rows still parse. */
  cvPrices: z.object({ cv_new: z.number().int().min(1).max(100_000), cv_tailor: z.number().int().min(1).max(100_000) }).partial().default({}),
  /** ETB per CV pack. Partial overrides are merged over DEFAULT_CV_PACK_PRICES. */
  cvPackPrices: z.object({ cv_pack_s: z.number().int().min(1).max(100_000), cv_pack_m: z.number().int().min(1).max(100_000), cv_pack_l: z.number().int().min(1).max(100_000) }).partial().default({}),
  unpaidCvCap: z.number().int().min(0).max(20).default(2),
  /** Unpaid / volunteer roles: sent with a clear label, or excluded everywhere. */
  unpaidJobs: z.enum(["label", "exclude"]).default("label"),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Parses Setting rows ({ key, value }) into Settings, falling back to defaults on bad data. */
export function parseSettings(rows: { key: string; value: unknown }[]): { settings: Settings; error?: string } {
  const parsed = settingsSchema.safeParse(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  return parsed.success ? { settings: parsed.data } : { settings: DEFAULT_SETTINGS, error: parsed.error.message };
}

const clamp = (value: unknown, fallback: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? Math.min(value, max) : fallback;

/** CV allowance override: null = unlimited, a whole number = that many, anything else = the default. */
const allowance = (value: unknown, fallback: number | null) =>
  value === null ? null : typeof value === "number" && Number.isInteger(value) && value >= 0 ? Math.min(value, MAX_LIMITS.cvPerMonth) : fallback;

/** Merges admin overrides over the defaults, ignoring bad values and capping at hard maximums. */
export function resolveLimits(plan: Plan, settings: Settings): PlanLimits {
  const base = DEFAULT_PLAN_LIMITS[plan];
  const o: Partial<PlanLimits> = settings.planLimits[plan] ?? {};
  const cap =
    o.dailyJobCap === null ? null : o.dailyJobCap === undefined ? base.dailyJobCap : clamp(o.dailyJobCap, 10, MAX_LIMITS.dailyJobCap);
  return {
    maxProfessions: clamp(o.maxProfessions, base.maxProfessions, MAX_LIMITS.maxProfessions),
    maxFunctions: clamp(o.maxFunctions, base.maxFunctions, MAX_LIMITS.maxFunctions),
    maxFieldsOfStudy: clamp(o.maxFieldsOfStudy, base.maxFieldsOfStudy, MAX_LIMITS.maxFieldsOfStudy),
    maxLocations: clamp(o.maxLocations, base.maxLocations, MAX_LIMITS.maxLocations),
    dailyJobCap: cap === 0 ? base.dailyJobCap : cap,
    premiumJobs: typeof o.premiumJobs === "boolean" ? o.premiumJobs : base.premiumJobs,
    cvNewPerMonth: allowance(o.cvNewPerMonth, base.cvNewPerMonth),
    cvTailorPerMonth: allowance(o.cvTailorPerMonth, base.cvTailorPerMonth),
  };
}

/** One-time CV prices: defaults with admin overrides. */
export function resolveCvPrices(settings: Settings): Record<CvProduct, number> {
  return { ...DEFAULT_CV_PRICES, ...settings.cvPrices };
}

/** Current prices: defaults with admin overrides. */
export function resolvePrices(settings: Settings): PriceTable {
  const pick = (plan: (typeof PAID_PLANS)[number]) => ({ ...DEFAULT_PRICES[plan], ...(settings.prices[plan] ?? {}) });
  return { pro: pick("pro"), career: pick("career") };
}

/** The plan whose limits apply right now. */
export function effectivePlan(
  user: { plan: string; planExpiresAt: Date | null },
  settings: Settings,
  now: Date = new Date(),
): Plan {
  const paid = (user.plan === "pro" || user.plan === "career") && (!user.planExpiresAt || user.planExpiresAt > now);
  if (paid) return user.plan as Plan;
  // Beta: everyone gets Pro; a paid Career plan still wins (above).
  if (settings.betaAllPro) return "pro";
  return "free";
}

export function resolveCvPackPrices(settings: Settings): Record<(typeof CV_PACKS)[number], number> {
  return { ...DEFAULT_CV_PACK_PRICES, ...settings.cvPackPrices };
}

/** The packs as sold, with live prices. */
export function cvPacks(settings: Settings): { id: (typeof CV_PACKS)[number]; name: string; price: number; newCvs: number; tailored: number }[] {
  const prices = resolveCvPackPrices(settings);
  return CV_PACKS.map((id) => ({ id, ...CV_PACK_CONTENTS[id], price: prices[id] }));
}
