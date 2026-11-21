import type { Job } from "@ethio/db";
import {
  applyHowText,
  applyTarget,
  educationText,
  employerLabel,
  experienceText,
  genderText,
  isPremiumJob,
  jobTypeText,
  locationText,
  notStated,
  salaryText,
  type EmployerFilter,
  type JobCardDto,
} from "@ethio/shared";

/** Pure feed helpers: DTO mapping (with premium redaction), cursors, filter mapping. Unit-tested. */

export interface CardContext {
  /** The user's plan includes premium jobs. */
  premiumJobs: boolean;
  match: JobCardDto["match"];
  fieldNames: ReadonlyMap<string, string>;
  sourceTitles: ReadonlyMap<string, string>;
}

export function toCard(job: Job, ctx: CardContext): JobCardDto {
  const locked = isPremiumJob(job) && !ctx.premiumJobs;
  const base = {
    id: job.id,
    title: job.title,
    locked,
    match: ctx.match,
    employerType: job.employerType,
    employerLabel: employerLabel(job.employerType) ?? (job.isOverseas ? "Abroad" : null),
    location: locationText(job),
    deadline: job.deadline?.toISOString() ?? null,
    firstSeenAt: job.firstSeenAt.toISOString(),
  };
  if (locked) {
    // Teaser only: enough to want it, not enough to apply without upgrading.
    return {
      ...base,
      company: null,
      experience: null,
      education: null,
      jobType: null,
      salary: null,
      gender: null,
      summary: null,
      skills: [],
      notStated: [],
      apply: null,
      sourceTitle: null,
      sourceUrl: null,
    };
  }
  const fields = job.fieldOfStudyIds.filter((id) => id !== "any_field").map((id) => ctx.fieldNames.get(id) ?? "").filter(Boolean);
  const target = applyTarget(job);
  return {
    ...base,
    company: job.company,
    experience: experienceText(job.experienceMin, job.experienceMax),
    education: educationText(job.educationLevel, fields),
    jobType: jobTypeText(job.employmentType, job.positions),
    salary: salaryText(job.salaryRaw, job.qualityFlags.includes("unpaid")),
    gender: genderText(job.genderReq),
    summary: job.summary,
    skills: job.skills,
    notStated: notStated(job),
    apply: {
      url: /^https?:\/\//i.test(target.url) ? target.url : null,
      label: target.label,
      how: applyHowText(job),
    },
    sourceTitle: ctx.sourceTitles.get(job.primarySourceId) ?? null,
    sourceUrl: /^https?:\/\//i.test(job.sourceUrl) ? job.sourceUrl : null,
  };
}

/** Keyset cursor: (sort time, id), newest first. Opaque base64url to the client. */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const at = new Date(iso ?? "");
    if (!id || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/** Employer filter chips → stored employer types. */
export function employerTypes(filters: EmployerFilter[]): string[] {
  const map: Record<EmployerFilter, string[]> = {
    private: ["local_private"],
    government: ["government"],
    ngo: ["ngo"],
    international: ["international_org", "embassy"],
    foreign: ["foreign_company"],
  };
  return [...new Set(filters.flatMap((f) => map[f]))];
}

/** Search words (max 5, 2+ chars). Every word must appear in the title, company, summary or skills. */
export function searchTerms(q: string | undefined): string[] {
  if (!q) return [];
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}+#.-]/gu, ""))
    .filter((w) => w.length >= 2)
    .slice(0, 5);
}
