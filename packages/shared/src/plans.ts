import type { BillingPeriod, PaidPlan, Plan } from "./enums";

/**
 * What each plan allows. Defaults only: admins override them in settings
 * (planLimits), and prices live in settings too. Every plan gets instant alerts.
 */
export interface PlanLimits {
  maxProfessions: number;
  /** Whole job categories followed (e.g. "Accounting & Finance"); 0 = none. */
  maxFunctions: number;
  maxFieldsOfStudy: number;
  maxLocations: number;
  /** Job alerts per day (Addis Ababa day); null = unlimited. */
  dailyJobCap: number | null;
  /** NGO, UN/AU/embassy, foreign-company and overseas jobs. Without it they're teased once a day. */
  premiumJobs: boolean;
  /** New or improved CVs included per 30 days; null = unlimited (fair use). Past it: pay per CV. */
  cvNewPerMonth: number | null;
  /** CVs tailored to a job included per 30 days; null = unlimited (fair use). */
  cvTailorPerMonth: number | null;
}

export const DEFAULT_PLAN_LIMITS: Record<Plan, PlanLimits> = {
  // Following jobs is generous on every plan (jobs are scarce; narrow matching means few alerts).
  // Plans differ on alerts per day, premium jobs and CVs.
  free: { maxProfessions: 10, maxFunctions: 3, maxFieldsOfStudy: 3, maxLocations: 3, dailyJobCap: 10, premiumJobs: false, cvNewPerMonth: 0, cvTailorPerMonth: 0 },
  pro: { maxProfessions: 25, maxFunctions: 6, maxFieldsOfStudy: 5, maxLocations: 10, dailyJobCap: null, premiumJobs: true, cvNewPerMonth: 2, cvTailorPerMonth: 10 },
  career: { maxProfessions: 40, maxFunctions: 12, maxFieldsOfStudy: 10, maxLocations: 20, dailyJobCap: null, premiumJobs: true, cvNewPerMonth: 5, cvTailorPerMonth: null },
};

/** Hard ceilings, whatever the settings say (guards against a bad admin value). */
export const MAX_LIMITS = {
  maxProfessions: 60,
  maxFunctions: 24,
  maxFieldsOfStudy: 10,
  maxLocations: 20,
  dailyJobCap: 200,
  cvPerMonth: 500,
} as const;

/** "Unlimited" CV allowances are fair-use: never shown, only in the Terms. */
export const CV_FAIR_USE_PER_MONTH = 100;

/** CV packs: credits that never expire, used once the plan's allowance runs out. Prices: settings.cvPackPrices. */
export const CV_PACKS = ["cv_pack_s", "cv_pack_m", "cv_pack_l"] as const;
export type CvPackId = (typeof CV_PACKS)[number];
export const CV_PACK_CONTENTS: Record<CvPackId, { name: string; newCvs: number; tailored: number }> = {
  cv_pack_s: { name: "Starter", newCvs: 2, tailored: 5 },
  cv_pack_m: { name: "Job hunt", newCvs: 5, tailored: 15 },
  cv_pack_l: { name: "All in", newCvs: 10, tailored: 40 },
};
export const DEFAULT_CV_PACK_PRICES: Record<CvPackId, number> = { cv_pack_s: 99, cv_pack_m: 199, cv_pack_l: 349 };

/** What a locked CV is waiting for: a new/improved CV credit or a tailored CV credit. (No longer sold one by one.) */
export const CV_PRODUCTS = ["cv_new", "cv_tailor"] as const;
export type CvProduct = (typeof CV_PRODUCTS)[number];
export const DEFAULT_CV_PRICES: Record<CvProduct, number> = { cv_new: 49, cv_tailor: 19 };

/** Prices in ETB per period. Defaults only: admins override them in settings (prices). */
export type PriceTable = Record<PaidPlan, Record<BillingPeriod, number>>;

export const DEFAULT_PRICES: PriceTable = {
  // Weekly plans are no longer sold (see SOLD_PERIODS); the price stays for old payments.
  pro: { week: 59, month: 199, quarter: 499 },
  career: { week: 89, month: 299, quarter: 749 },
};

/** Periods offered at checkout. */
export const SOLD_PERIODS = ["month", "quarter"] as const;

export const PERIOD_DAYS: Record<BillingPeriod, number> = { week: 7, month: 30, quarter: 90 };

export const PERIOD_LABEL: Record<BillingPeriod, string> = { week: "Week", month: "Month", quarter: "3 months" };

export const PLAN_NAME: Record<Plan, string> = { free: "Free", pro: "Pro", career: "Career" };

/** Order for comparisons ("is this an upgrade?"). */
export const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, career: 2 };
