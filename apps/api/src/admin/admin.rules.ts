import { z } from "zod";
import { BILLING_PERIODS, MAX_LIMITS, PAID_PLANS, PLANS } from "@ethio/shared";

/** Pure admin helpers and input schemas. Unit-tested. */

/** Why a job was held for review, in plain words. */
export function reviewReasons(job: { qualityFlags: string[]; professionId: string | null; functionId: string | null }): string[] {
  const reasons: string[] = [];
  if (job.qualityFlags.includes("fee_required")) reasons.push("Asks applicants to pay");
  if (job.qualityFlags.includes("suspicious")) reasons.push("Looks suspicious");
  if (!job.professionId && !job.functionId) reasons.push("Couldn't classify");
  return reasons.length ? reasons : ["Held for review"];
}

/** Telegram @handle → source id ("@Ethio_Jobs" → "ethio_jobs"). */
export function sourceIdFromHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export const TELEGRAM_HANDLE = /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/;

const count = (max: number) => z.number().int().min(0).max(max);
const limitsSchema = z
  .object({
    maxProfessions: count(MAX_LIMITS.maxProfessions),
    maxFunctions: count(MAX_LIMITS.maxFunctions),
    maxFieldsOfStudy: count(MAX_LIMITS.maxFieldsOfStudy),
    maxLocations: count(MAX_LIMITS.maxLocations),
    /** null = unlimited. */
    dailyJobCap: z.number().int().min(1).max(MAX_LIMITS.dailyJobCap).nullable(),
    premiumJobs: z.boolean(),
    /** null = unlimited (fair use). */
    cvNewPerMonth: z.number().int().min(0).max(MAX_LIMITS.cvPerMonth).nullable(),
    cvTailorPerMonth: z.number().int().min(0).max(MAX_LIMITS.cvPerMonth).nullable(),
  })
  .strict();
const priceRow = z.object(Object.fromEntries(BILLING_PERIODS.map((p) => [p, z.number().int().min(1).max(100_000)]))).strict();

/** Everything the admin can change in one save; each key is optional. */
export const settingsUpdateSchema = z
  .object({
    betaAllPro: z.boolean(),
    unpaidJobs: z.enum(["label", "exclude"]),
    delivery: z
      .object({
        maxJobAgeHours: z.number().int().min(1).max(168),
        teaserHourEat: z.number().int().min(0).max(23),
        quietFromEat: z.number().int().min(0).max(23),
        quietToEat: z.number().int().min(0).max(23),
      })
      .strict(),
    prices: z.object(Object.fromEntries(PAID_PLANS.map((p) => [p, priceRow]))).strict(),
    planLimits: z.object(Object.fromEntries(PLANS.map((p) => [p, limitsSchema]))).strict(),
    cvPrices: z.object({ cv_new: z.number().int().min(1).max(100_000), cv_tailor: z.number().int().min(1).max(100_000) }).strict(),
    unpaidCvCap: z.number().int().min(0).max(20),
  })
  .partial()
  .strict();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const approveSchema = z
  .object({
    /** Required when the job couldn't be classified (otherwise nobody would match it). */
    professionId: z.string().min(1).max(80).optional(),
    functionId: z.string().min(1).max(80).optional(),
  })
  .strict();

export const sourcePatchSchema = z
  .object({
    isActive: z.boolean(),
    trust: z.number().min(0).max(1),
    linkPriority: z.number().int().min(0).max(100),
    title: z.string().trim().min(1).max(120),
  })
  .partial()
  .strict();

export const sourceCreateSchema = z.object({ handle: z.string().trim().regex(TELEGRAM_HANDLE, "Enter a channel @handle"), title: z.string().trim().max(120).optional() }).strict();
