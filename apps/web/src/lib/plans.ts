import { PERIOD_DAYS, type BillingPeriod, type Plan, type PlanLimits } from "@ethio/shared";

/** Plan copy for the Mini App. Numbers come from the API's limits, so admin overrides show correctly. */

export const PLAN_TAGLINE: Record<Plan, string> = {
  free: "Local jobs, instantly",
  pro: "Every job that fits you",
  career: "For a serious job search",
};

export interface Feature {
  text: string;
  /** Shown greyed with a lock: what this plan doesn't include. */
  missing?: boolean;
  soon?: boolean;
}

export function planFeatures(plan: Plan, l: PlanLimits): Feature[] {
  const professions = l.maxFunctions
    ? `Follow ${l.maxFunctions} job ${l.maxFunctions === 1 ? "category" : "categories"} + ${l.maxProfessions} specific roles`
    : `Follow ${l.maxProfessions} specific roles`;
  const alerts = l.dailyJobCap === null ? "Unlimited instant alerts" : `Up to ${l.dailyJobCap} instant alerts a day`;
  const premium: Feature = l.premiumJobs
    ? { text: "NGO, UN, AU, embassy, foreign-company & overseas jobs" }
    : { text: "NGO, international & overseas jobs (daily summary only)", missing: true };
  const features: Feature[] = [{ text: professions }, { text: alerts }, premium];
  if (plan === "free") features.push({ text: "Local private-sector & government jobs" });
  const cvs = (n: number | null, one: string, many: string) => (n === null ? `Unlimited ${many}` : `${n} ${n === 1 ? one : many}`);
  if (l.cvNewPerMonth || l.cvTailorPerMonth !== 0) {
    features.push({ text: `${cvs(l.cvNewPerMonth, "new or improved CV", "new or improved CVs")} + ${cvs(l.cvTailorPerMonth, "tailored CV", "tailored CVs")} a month` });
  } else {
    features.push({ text: "Make CVs free, unlock them with a CV pack" });
  }
  return features;
}

export const PERIOD_SHORT: Record<BillingPeriod, string> = { week: "/week", month: "/month", quarter: "/3 months" };

/** "Save 15%" against paying monthly for the same days. */
export function savingVsMonthly(prices: Record<BillingPeriod, number>, period: BillingPeriod): number | null {
  if (period !== "quarter") return null;
  const monthlyEquivalent = (prices.month / PERIOD_DAYS.month) * PERIOD_DAYS.quarter;
  const pct = Math.round((1 - prices.quarter / monthlyEquivalent) * 100);
  return pct >= 5 ? pct : null;
}

export function formatBirr(n: number): string {
  return `${n.toLocaleString("en-US")} Br`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Africa/Addis_Ababa" });
}
