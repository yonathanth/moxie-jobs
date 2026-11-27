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
  type PublicJobDto,
} from "@ethio/shared";

/** Pure feed helpers: DTO mapping (redacting locked jobs: kinds the plan lacks, or over today's limit), cursors, filter mapping. Unit-tested. */

export interface CardContext {
  /** The user's plan includes premium jobs. */
  premiumJobs: boolean;
  match: JobCardDto["match"];
  /** Matched over today's free alert limit: locked until tomorrow. */
  heldToday?: boolean;
  /** The user bookmarked it. */
  saved?: boolean;
  fieldNames: ReadonlyMap<string, string>;
  sourceTitles: ReadonlyMap<string, string>;
}

export function toCard(job: Job, ctx: CardContext): JobCardDto {
  const premium = isPremiumJob(job);
  const lockReason: JobCardDto["lockReason"] = premium && !ctx.premiumJobs ? "premium" : ctx.heldToday ? "daily_limit" : null;
  const locked = lockReason !== null;
  const base = {
    id: job.id,
    title: job.title,
    locked,
    lockReason,
    premium,
    match: ctx.match,
    saved: ctx.saved ?? false,
    functionId: job.functionId,
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
      requirements: [],
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
    requirements: job.requirements,
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

/** First sentences of a summary, at most ~max chars, cut at a sentence or word boundary. */
export function teaserOf(summary: string, max = 220): string {
  const text = summary.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.4) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

/** A shared job link (public). Premium jobs show only what a locked card shows. Never includes how to apply. */
export function toPublic(job: Job, now = new Date()): PublicJobDto {
  const premium = isPremiumJob(job);
  return {
    id: job.id,
    title: job.title,
    company: premium ? null : job.company,
    employerLabel: employerLabel(job.employerType) ?? (job.isOverseas ? "Abroad" : null),
    location: locationText(job),
    jobType: jobTypeText(job.employmentType, job.positions),
    experience: premium ? null : experienceText(job.experienceMin, job.experienceMax),
    salary: premium ? null : salaryText(job.salaryRaw, job.qualityFlags.includes("unpaid")),
    deadline: job.deadline?.toISOString() ?? null,
    firstSeenAt: job.firstSeenAt.toISOString(),
    teaser: premium ? null : teaserOf(job.summary),
    skills: premium ? [] : job.skills.slice(0, 6),
    closed: job.status === "expired" || (job.deadline !== null && job.deadline <= now),
  };
}

/**
 * Moves `pins` to the given positions (in order), removing them from wherever they were in `items`.
 * Positions past the end append. Used to show locked premium matches 1st and 3rd.
 */
export function pinAt<T>(items: T[], pins: T[], positions: number[], key: (t: T) => string): T[] {
  const pinned = new Set(pins.map(key));
  const out = items.filter((i) => !pinned.has(key(i)));
  pins.slice(0, positions.length).forEach((p, i) => out.splice(Math.min(positions[i]!, out.length), 0, p));
  return out;
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
