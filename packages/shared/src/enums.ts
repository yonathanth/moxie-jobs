/**
 * Fixed vocabularies shared by the API, the worker (extraction + matching)
 * and the web app. Values are stable ids stored in the database: add new
 * ones freely, but never rename or remove an existing id.
 */

export const EDUCATION_LEVELS = [
  { id: "none", label: "No formal requirement" },
  { id: "certificate", label: "Certificate" },
  { id: "tvet", label: "TVET (Level I–IV)" },
  { id: "diploma", label: "Diploma" },
  { id: "bachelor", label: "Bachelor's degree" },
  { id: "master", label: "Master's degree" },
  { id: "phd", label: "PhD" },
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]["id"];
export const EDUCATION_LEVEL_IDS = EDUCATION_LEVELS.map((e) => e.id) as [EducationLevel, ...EducationLevel[]];

/** Rank for comparisons: a user qualifies when rank(user) >= rank(job requirement). */
export function educationRank(level: EducationLevel): number {
  return EDUCATION_LEVEL_IDS.indexOf(level);
}

export const EXPERIENCE_BANDS = [
  { id: "0", label: "Fresh graduate / no experience", min: 0, max: 0 },
  { id: "1-2", label: "1–2 years", min: 1, max: 2 },
  { id: "3-5", label: "3–5 years", min: 3, max: 5 },
  { id: "6-9", label: "6–9 years", min: 6, max: 9 },
  { id: "10+", label: "10+ years", min: 10, max: 60 },
] as const;
export type ExperienceBand = (typeof EXPERIENCE_BANDS)[number]["id"];
export const EXPERIENCE_BAND_IDS = EXPERIENCE_BANDS.map((e) => e.id) as [ExperienceBand, ...ExperienceBand[]];

export const EMPLOYMENT_TYPES = [
  { id: "full_time", label: "Full-time" },
  { id: "part_time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
  { id: "freelance", label: "Freelance" },
  { id: "volunteer", label: "Volunteer" },
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["id"];
export const EMPLOYMENT_TYPE_IDS = EMPLOYMENT_TYPES.map((e) => e.id) as [EmploymentType, ...EmploymentType[]];

/** Optional; only used to skip jobs restricted to the other gender ("female applicants only"). */
export const GENDERS = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
] as const;
export type Gender = (typeof GENDERS)[number]["id"];
export const GENDER_IDS = GENDERS.map((g) => g.id) as [Gender, ...Gender[]];

export const PLANS = ["free", "pro", "career"] as const;
export type Plan = (typeof PLANS)[number];
export const PAID_PLANS = ["pro", "career"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

export const BILLING_PERIODS = ["week", "month", "quarter"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/**
 * Who is hiring. Set by extraction; premium types are paid-plan only
 * (free users get a once-a-day teaser instead).
 */
export const EMPLOYER_TYPES = [
  { id: "local_private", label: "Local company", premium: false },
  { id: "government", label: "Government", premium: false },
  { id: "ngo", label: "NGO", premium: true },
  { id: "international_org", label: "UN / AU / international organization", premium: true },
  { id: "embassy", label: "Embassy", premium: true },
  { id: "foreign_company", label: "Foreign company", premium: true },
] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number]["id"];
export const EMPLOYER_TYPE_IDS = EMPLOYER_TYPES.map((e) => e.id) as [EmployerType, ...EmployerType[]];

/** Paid-plan job: premium employer type, or located abroad. */
export function isPremiumJob(job: { employerType: string | null; isOverseas: boolean }): boolean {
  return job.isOverseas || EMPLOYER_TYPES.some((e) => e.premium && e.id === job.employerType);
}

/** Teaser bucket for a premium job ("3 NGO · 1 UN/AU/embassy · 2 foreign company · 1 overseas"). */
export function premiumBucket(job: { employerType: string | null; isOverseas: boolean }): "ngo" | "intl" | "foreign" | "overseas" | null {
  if (job.isOverseas) return "overseas";
  if (job.employerType === "ngo") return "ngo";
  if (job.employerType === "international_org" || job.employerType === "embassy") return "intl";
  if (job.employerType === "foreign_company") return "foreign";
  return null;
}
