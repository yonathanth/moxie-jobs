import { EDUCATION_LEVELS, EMPLOYMENT_TYPES, type EmployerType } from "./enums";
import { CITIES } from "./locations";

/**
 * How a job is described to users. Shared by the Telegram card (worker) and
 * the Mini App feed (API DTO + web), so both read the same. Pure.
 */

export interface JobFacts {
  title: string;
  company: string | null;
  employerType: string | null;
  locationIds: string[];
  locationRaw: string | null;
  workMode: string | null;
  isOverseas: boolean;
  country: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  educationLevel: string | null;
  employmentType: string | null;
  positions: number | null;
  salaryRaw: string | null;
  genderReq: string;
  deadline: Date | null;
  applyMethod: string;
  applyEmail: string | null;
  applyPhone: string | null;
  applyNotes: string | null;
  /** Extraction flags (e.g. "unpaid"). */
  qualityFlags?: string[];
}

/** Shown next to the company; local private employers get no label. */
export const EMPLOYER_LABEL: Record<EmployerType, string | null> = {
  local_private: null,
  government: "Government",
  ngo: "NGO",
  international_org: "International organization",
  embassy: "Embassy",
  foreign_company: "International company",
};

const cityName = new Map(CITIES.map((c) => [c.id, c.name]));
const educationLabel = new Map<string, string>(EDUCATION_LEVELS.map((e) => [e.id, e.label]));
const employmentLabel = new Map<string, string>(EMPLOYMENT_TYPES.map((e) => [e.id, e.label]));

export function employerLabel(type: string | null): string | null {
  return type ? (EMPLOYER_LABEL[type as EmployerType] ?? null) : null;
}

/** "Addis Ababa, Adama (Hybrid)", "Remote", "Abroad: Qatar"; null when unknown. */
export function locationText(j: Pick<JobFacts, "locationIds" | "locationRaw" | "workMode" | "isOverseas" | "country">): string | null {
  if (j.isOverseas) return j.country ? `Abroad: ${j.country}` : "Abroad";
  if (j.workMode === "remote") return "Remote";
  const place = j.locationIds.length ? j.locationIds.map((id) => cityName.get(id) ?? id).join(", ") : j.locationRaw;
  if (!place) return null;
  return j.workMode === "hybrid" ? `${place} (Hybrid)` : place;
}

/** "Fresh graduates", "2–5 years", "5+ years", "Up to 3 years"; null when not stated. */
export function experienceText(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if ((min ?? 0) === 0 && max === 0) return "Fresh graduates";
  const yrs = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
  if (min !== null && max !== null) return min === max ? yrs(min) : `${min}–${max} years`;
  if (min !== null) return `${min}+ years`;
  return `Up to ${yrs(max!)}`;
}

/** "Bachelor's degree in Accounting, Finance"; null when not stated or no formal requirement. */
export function educationText(level: string | null, fieldNames: string[] = []): string | null {
  const base = level && level !== "none" ? educationLabel.get(level) ?? null : null;
  const fields = fieldNames.filter(Boolean).slice(0, 3);
  if (base && fields.length) return `${base} in ${fields.join(", ")}`;
  if (fields.length) return fields.join(", ");
  return base;
}

/** "Contract · 3 positions"; full-time is assumed and left out. */
export function jobTypeText(employmentType: string | null, positions: number | null): string | null {
  const parts = [
    employmentType && employmentType !== "full_time" ? employmentLabel.get(employmentType) ?? null : null,
    positions && positions > 1 ? `${positions} positions` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Unpaid or volunteer role (an admin setting decides: labelled, or excluded). */
export function isUnpaidJob(j: { qualityFlags?: string[]; employmentType: string | null }): boolean {
  return (j.qualityFlags ?? []).includes("unpaid") || j.employmentType === "volunteer";
}

/** Salary text only when it carries a figure ("Attractive", "As per scale" say nothing); "Unpaid" for unpaid roles. */
export function salaryText(raw: string | null, unpaid = false): string | null {
  if (unpaid) return "Unpaid";
  return raw && /\d/.test(raw) ? raw : null;
}

export function genderText(genderReq: string): string | null {
  if (genderReq === "female") return "Female applicants only";
  if (genderReq === "male") return "Male applicants only";
  return null;
}

/** "Nov 30 (10 days left)" in Addis Ababa time. */
export function deadlineText(deadline: Date, now: Date = new Date()): string {
  const date = new Date(deadline.getTime() + 3 * 3_600_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const days = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 3_600_000));
  const left = days <= 0 ? "closes today" : days === 1 ? "1 day left" : `${days} days left`;
  return `${date} (${left})`;
}

/**
 * Key facts a post didn't state ("Not stated: experience, location"). Salary is
 * left out: it's missing in most posts, so listing it would be noise.
 */
export function notStated(j: JobFacts): string[] {
  const missing: string[] = [];
  if (!locationText(j)) missing.push("location");
  if (experienceText(j.experienceMin, j.experienceMax) === null) missing.push("experience");
  if (!j.educationLevel) missing.push("education");
  if (!j.deadline) missing.push("deadline");
  return missing;
}

/** How to apply, in words, for methods the Apply button can't fully do (email, phone, in person). */
export function applyHowText(j: Pick<JobFacts, "applyMethod" | "applyEmail" | "applyPhone" | "applyNotes">): string | null {
  switch (j.applyMethod) {
    case "email":
      return j.applyEmail ? `Send your CV to ${j.applyEmail}` : null;
    case "phone":
      return j.applyPhone ? `Call ${j.applyPhone}` : null;
    case "in_person":
      return j.applyNotes ? `In person: ${j.applyNotes}` : "In person (see the original post for the address)";
    default:
      return j.applyNotes && j.applyNotes.length <= 160 ? j.applyNotes : null;
  }
}

/**
 * A job's pay as ETB per month, when the post states it in a comparable way
 * (ETB or unspecified currency; month, year, day or hour). Null otherwise.
 * Uses the top of the stated range: a job paying "8,000–12,000" isn't below 10,000.
 */
export function monthlySalaryEtb(j: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryPeriod: string | null }): number | null {
  const amount = j.salaryMax ?? j.salaryMin;
  if (amount === null || amount <= 0) return null;
  if (j.salaryCurrency && j.salaryCurrency !== "ETB") return null;
  switch (j.salaryPeriod ?? "month") {
    case "month":
      return amount;
    case "year":
      return Math.round(amount / 12);
    case "day":
      return amount * 26;
    case "hour":
      return amount * 208;
    default:
      return null; // per project: not comparable
  }
}
