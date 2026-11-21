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
  free: { maxProfessions: 2, maxFunctions: 0, maxFieldsOfStudy: 3, maxLocations: 3, dailyJobCap: 10, premiumJobs: false, cvNewPerMonth: 0, cvTailorPerMonth: 0 },
  pro: { maxProfessions: 5, maxFunctions: 3, maxFieldsOfStudy: 5, maxLocations: 10, dailyJobCap: null, premiumJobs: true, cvNewPerMonth: 2, cvTailorPerMonth: 10 },
  career: { maxProfessions: 10, maxFunctions: 8, maxFieldsOfStudy: 10, maxLocations: 20, dailyJobCap: null, premiumJobs: true, cvNewPerMonth: 5, cvTailorPerMonth: null },
};

/** Hard ceilings, whatever the settings say (guards against a bad admin value). */
export const MAX_LIMITS = {
  maxProfessions: 10,
  maxFunctions: 10,
  maxFieldsOfStudy: 10,
  maxLocations: 20,
  dailyJobCap: 200,
  cvPerMonth: 500,
} as const;

/** "Unlimited" CV allowances are fair-use: never shown, only in the Terms. */
export const CV_FAIR_USE_PER_MONTH = 100;

/** One-time CV products (ETB). Defaults; admins override in settings (cvPrices). */
export const CV_PRODUCTS = ["cv_new", "cv_tailor"] as const;
export type CvProduct = (typeof CV_PRODUCTS)[number];
export const DEFAULT_CV_PRICES: Record<CvProduct, number> = { cv_new: 49, cv_tailor: 19 };

/** Prices in ETB per period. Defaults only: admins override them in settings (prices). */
export type PriceTable = Record<PaidPlan, Record<BillingPeriod, number>>;

export const DEFAULT_PRICES: PriceTable = {
  pro: { week: 39, month: 129, quarter: 329 },
  career: { week: 99, month: 349, quarter: 899 },
};

export const PERIOD_DAYS: Record<BillingPeriod, number> = { week: 7, month: 30, quarter: 90 };

export const PERIOD_LABEL: Record<BillingPeriod, string> = { week: "Week", month: "Month", quarter: "3 months" };

export const PLAN_NAME: Record<Plan, string> = { free: "Free", pro: "Pro", career: "Career" };

/** Order for comparisons ("is this an upgrade?"). */
export const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, career: 2 };
