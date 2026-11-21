import { educationRank, EXPERIENCE_BANDS, monthlySalaryEtb, type EducationLevel, type PlanLimits } from "@ethio/shared";

/** Matching rules (docs/ingestion-spec.md §10). Pure, so every rule is unit-tested. */

export interface MatchJob {
  title: string;
  professionId: string | null;
  functionId: string | null;
  fieldOfStudyIds: string[];
  educationLevel: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  locationIds: string[];
  workMode: string | null;
  employmentType: string | null;
  genderReq: string;
  isOverseas: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
}

export interface MatchCandidate {
  /** In saved order (main first); only the first N count, N = plan limit. */
  professionIds: string[];
  functionIds: string[];
  fieldOfStudyIds: string[];
  educationLevel: string | null;
  experienceBand: string | null;
  locationIds: string[];
  remoteOk: boolean;
  employmentTypes: string[];
  gender: string | null;
  overseasOk: boolean;
  /** Lowest monthly ETB they'd accept; null = any. */
  salaryMin: number | null;
}

/** Users with at least this many years don't get junior/intern/assistant titles. */
const SENIOR_BAND_MIN = 5;
/** Users with at most this many years don't get director/head/manager titles that state no experience. */
const ENTRY_BAND_MAX = 2;
const JUNIOR_TITLE = /\b(junior|jr\.?|intern|internship|trainee|apprentice|assistant)\b/i;
const SENIOR_TITLE = /\b(director|head|chief|manager|senior manager|vice president|vp)\b/i;

export interface QualityJob {
  summary: string;
  deadline: Date | null;
  educationLevel: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  applyMethod: string;
}

/**
 * Too little to act on: "X is hiring a Cashier." with no deadline, requirements
 * or contact (typically the details were in an image). Not sent; a richer repost
 * of the same vacancy merges into it later.
 */
export function isThinJob(job: QualityJob): boolean {
  const facts = [
    job.deadline !== null,
    job.educationLevel !== null,
    job.experienceMin !== null || job.experienceMax !== null,
    job.salaryMin !== null,
    job.applyMethod !== "source",
  ].filter(Boolean).length;
  return facts === 0 || (facts === 1 && job.summary.trim().length < 70);
}

export type MatchVerdict = { ok: true; via: "profession" | "function" | "field" } | { ok: false; reason: string };

export function matchJob(
  job: MatchJob,
  user: MatchCandidate,
  limits: PlanLimits,
  professionToFunction: ReadonlyMap<string, string>,
): MatchVerdict {
  const professions = user.professionIds.slice(0, limits.maxProfessions);
  const functions = user.functionIds.slice(0, limits.maxFunctions);
  const fields = user.fieldOfStudyIds.slice(0, limits.maxFieldsOfStudy);

  // Target: profession, followed category, or degree field.
  let via: "profession" | "function" | "field" | null = null;
  if (job.professionId && professions.includes(job.professionId)) via = "profession";
  else if (job.functionId && functions.includes(job.functionId)) via = "function";
  else {
    const jobFields = job.fieldOfStudyIds.filter((f) => f !== "any_field");
    const fieldHit = jobFields.some((f) => fields.includes(f));
    if (fieldHit) {
      // A degree alone matches too broadly ("BA in Management" is everywhere): count it only for
      // users matching by degree, or when the job is in a category related to what they follow.
      const related = new Set([...functions, ...professions.map((p) => professionToFunction.get(p)).filter(Boolean)]);
      if (professions.length + functions.length === 0 || (job.functionId && related.has(job.functionId))) via = "field";
    }
  }
  if (!via) return { ok: false, reason: "target" };

  if (user.educationLevel && job.educationLevel) {
    if (educationRank(user.educationLevel as EducationLevel) < educationRank(job.educationLevel as EducationLevel)) {
      return { ok: false, reason: "education" };
    }
  }

  const band = EXPERIENCE_BANDS.find((b) => b.id === user.experienceBand);
  if (band && (job.experienceMin !== null || job.experienceMax !== null)) {
    const jobMin = job.experienceMin ?? 0;
    const jobMax = job.experienceMax ?? 60;
    if (band.min > jobMax || band.max < jobMin) return { ok: false, reason: "experience" };
  }
  // Posts often omit years or say "2+ yrs": the title still tells the level.
  if (band && band.min >= SENIOR_BAND_MIN && JUNIOR_TITLE.test(job.title)) return { ok: false, reason: "seniority" };
  if (band && band.max <= ENTRY_BAND_MAX && job.experienceMin === null && SENIOR_TITLE.test(job.title)) {
    return { ok: false, reason: "seniority" };
  }

  if (job.isOverseas) {
    if (!user.overseasOk) return { ok: false, reason: "overseas" };
  } else {
    const cityHit = job.locationIds.some((c) => user.locationIds.includes(c));
    if (job.workMode === "remote") {
      if (!user.remoteOk && !cityHit) return { ok: false, reason: "remote" };
    } else if (user.locationIds.length && job.locationIds.length && !cityHit) {
      return { ok: false, reason: "location" };
    }
  }

  if (user.employmentTypes.length && job.employmentType && !user.employmentTypes.includes(job.employmentType)) {
    return { ok: false, reason: "employment_type" };
  }

  if (job.genderReq !== "any" && user.gender && user.gender !== job.genderReq) return { ok: false, reason: "gender" };

  // Only jobs that state their pay can be ruled out; most posts don't.
  if (user.salaryMin) {
    const monthly = monthlySalaryEtb(job);
    if (monthly !== null && monthly < user.salaryMin) return { ok: false, reason: "salary" };
  }

  return { ok: true, via };
}
