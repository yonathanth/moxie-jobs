import { randomUUID } from "node:crypto";
import type { Job, Prisma } from "@ethio/db";
import { prisma } from "../db";
import { applyRank, jobSlug, type JobDraft } from "./normalize";
import { sameCompany, titleSimilarity } from "./text";

/** The Prisma client or an interactive-transaction client. */
export type Db = Pick<typeof prisma, "job" | "$queryRaw">;

const DAY = 24 * 60 * 60 * 1000;
const COMPANY_WINDOW_DAYS = 45;
const NO_COMPANY_WINDOW_DAYS = 7;
const TITLE_MIN_SIMILARITY = 0.6;
const SUMMARY_MIN_SIMILARITY = 0.5;
const DEADLINE_TOLERANCE_MS = 2 * DAY;

function deadlinesCompatible(a: Date | null, b: Date | null): boolean {
  return !a || !b || Math.abs(a.getTime() - b.getTime()) <= DEADLINE_TOLERANCE_MS;
}

/** Finds an existing job that is the same vacancy (docs/ingestion-spec.md §9). */
export async function findDuplicate(draft: JobDraft, db: Db = prisma, now = new Date()): Promise<Job | null> {
  if (draft.companyKey) {
    // Same key, or a similar one that sameCompany() confirms (spelling/word-order variants).
    const ids = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Job"
      WHERE "firstSeenAt" >= ${new Date(now.getTime() - COMPANY_WINDOW_DAYS * DAY)}
        AND ("companyKey" = ${draft.companyKey} OR similarity("companyKey", ${draft.companyKey}) >= 0.3)
      ORDER BY "firstSeenAt" DESC
      LIMIT 80`;
    const candidates = ids.length
      ? (await db.job.findMany({ where: { id: { in: ids.map((r) => r.id) } }, orderBy: { firstSeenAt: "desc" } })).filter(
          (c) => c.companyKey === draft.companyKey || sameCompany(c.company, draft.company),
        )
      : [];
    return (
      candidates.find(
        (c) =>
          deadlinesCompatible(c.deadline, draft.deadline) &&
          (titleSimilarity(c.title, draft.title) >= TITLE_MIN_SIMILARITY ||
            (!!draft.professionId && c.professionId === draft.professionId && titleSimilarity(c.rawTitle, draft.rawTitle) >= 0.4)),
      ) ?? null
    );
  }

  // No company named (common in reposts): same profession + similar title + similar summary, recent only.
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Job"
    WHERE "firstSeenAt" >= ${new Date(now.getTime() - NO_COMPANY_WINDOW_DAYS * DAY)}
      AND "professionId" IS NOT DISTINCT FROM ${draft.professionId}
      AND similarity("summary", ${draft.summary}) >= ${SUMMARY_MIN_SIMILARITY}
    ORDER BY similarity("summary", ${draft.summary}) DESC
    LIMIT 5`;
  if (!rows.length) return null;
  const candidates = await db.job.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return (
    candidates.find(
      (c) => deadlinesCompatible(c.deadline, draft.deadline) && titleSimilarity(c.title, draft.title) >= TITLE_MIN_SIMILARITY,
    ) ?? null
  );
}

const FILLABLE = [
  "company",
  "companyKey",
  "employerType",
  "professionId",
  "functionId",
  "educationLevel",
  "experienceMin",
  "experienceMax",
  "employmentType",
  "workMode",
  "locationRaw",
  "country",
  "positions",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "salaryPeriod",
  "salaryRaw",
  "deadline",
  "deadlineRaw",
  "applyNotes",
  "applyPhone",
  "roleBrief",
] as const;

/**
 * Merge a new sighting into an existing job: fill gaps, never overwrite known
 * values, take the better apply link and the higher-priority source link.
 */
export function mergeData(
  existing: Job,
  draft: JobDraft,
  sourcePriority: { existing: number; incoming: number },
  incomingSourceId: string,
): Prisma.JobUpdateInput {
  const data: Record<string, unknown> = {};
  for (const key of FILLABLE) {
    if (existing[key] === null && draft[key] !== null) data[key] = draft[key];
  }
  for (const key of ["fieldOfStudyIds", "locationIds", "skills", "requirements"] as const) {
    if (existing[key].length === 0 && draft[key].length > 0) data[key] = draft[key];
  }
  if (existing.genderReq === "any" && draft.genderReq !== "any") data.genderReq = draft.genderReq;
  if (applyRank(draft.applyMethod) < applyRank(existing.applyMethod)) {
    Object.assign(data, {
      applyMethod: draft.applyMethod,
      applyUrl: draft.applyUrl,
      applyEmail: draft.applyEmail,
      applyTelegram: draft.applyTelegram,
    });
  }
  if (sourcePriority.incoming > sourcePriority.existing) {
    data.primarySourceId = incomingSourceId;
    data.sourceUrl = draft.sourceUrl;
  }
  return data as Prisma.JobUpdateInput;
}

export function createData(draft: JobDraft, primarySourceId: string, firstSeenAt: Date): Prisma.JobCreateInput {
  const id = randomUUID();
  return { id, slug: jobSlug(draft.title, draft.company, id), primarySourceId, firstSeenAt, ...draft };
}
