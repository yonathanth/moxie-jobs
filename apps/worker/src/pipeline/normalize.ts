import { CITY_IDS } from "@ethio/shared";
import type { ExtractedJob } from "../ai/schema";
import { FLAG_IDS } from "../ai/schema";
import { ethiopianToGregorian } from "../lib/ethiopian-calendar";
import { companyKey } from "./text";

/** Job boards: a link to one of these is the source's page, not the employer's apply link. */
const JOB_BOARD_HOSTS = [
  "t.me",
  "telegram.me",
  "ethiojobs.net",
  "hahu.jobs",
  "geezjobs.com",
  "effoysira.com",
  "elelanajobs.com",
  "kebenajobs.com",
  "afriworket.com",
  "etcareers.com",
  "harmeejobs.com",
  "reportervacancy.com",
  "ethiopianreporterjobs.com",
  "ethioworks.com",
  "shegerjobs.com",
  "abayjobs.com",
  "merihjobs.com",
  "palmjobs.et",
  "srafelagi.com",
];

export function isJobBoardUrl(url: string, extraHosts: string[] = []): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return [...JOB_BOARD_HOSTS, ...extraHosts].some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return true; // unparseable: don't trust it as an employer link
  }
}

export interface SourceContext {
  id: string;
  handle: string | null;
  format: string;
  websiteDomains: string[];
}

export interface PostContext {
  messageId: bigint;
  postedAt: Date;
  links: string[];
  buttons: { text: string; url: string }[];
  pageUrl: string | null;
}

export interface TaxonomyIds {
  professionToFunction: ReadonlyMap<string, string>;
  functionIds: ReadonlySet<string>;
  fieldOfStudyIds: ReadonlySet<string>;
}

export interface JobDraft {
  title: string;
  rawTitle: string;
  company: string | null;
  companyKey: string | null;
  professionId: string | null;
  functionId: string | null;
  fieldOfStudyIds: string[];
  educationLevel: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  employmentType: string | null;
  workMode: string | null;
  locationIds: string[];
  locationRaw: string | null;
  isOverseas: boolean;
  country: string | null;
  employerType: string | null;
  positions: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryRaw: string | null;
  genderReq: string;
  deadline: Date | null;
  deadlineRaw: string | null;
  summary: string;
  roleBrief: string | null;
  skills: string[];
  requirements: string[];
  applyMethod: string;
  applyUrl: string | null;
  applyEmail: string | null;
  applyTelegram: string | null;
  applyPhone: string | null;
  applyNotes: string | null;
  sourceUrl: string;
  qualityFlags: string[];
  status: "active" | "expired" | "review";
}

/** Rank of an apply method: lower is better (docs/ingestion-spec.md §8). */
export function applyRank(method: string): number {
  return { url: 0, email: 1, telegram: 2, phone: 3, in_person: 4, source: 5 }[method] ?? 6;
}

/** End of the given calendar day in Addis Ababa (UTC+3, no DST) → 20:59:59Z. */
export function endOfDayEat(utcMidnight: Date): Date {
  return new Date(utcMidnight.getTime() + (24 * 60 * 60 - 3 * 60 * 60 - 1) * 1000);
}

function resolveDeadline(d: ExtractedJob["deadline"]): Date | null {
  if (!d) return null;
  if (d.calendar === "ethiopian" && d.ethiopian) {
    const g = ethiopianToGregorian(d.ethiopian.year, d.ethiopian.month, d.ethiopian.day);
    if (g) return endOfDayEat(g);
  }
  if (d.date) {
    const parsed = new Date(`${d.date}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return endOfDayEat(parsed);
  }
  return null;
}

export function onSourceDomain(url: string, domains: string[]): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Where "Source: X" points: the board's Mini App/page for this job, else the Telegram post. */
export function chooseSourceUrl(source: SourceContext, post: PostContext): string {
  const miniApp = post.buttons.find((b) => /^https?:\/\/t\.me\/[^?]+\?(startapp|start)=/i.test(b.url));
  if (source.format === "miniapp_link" && miniApp) return miniApp.url.replace(/^http:/, "https:");
  if (post.pageUrl) return post.pageUrl;
  const page = [...post.buttons.map((b) => b.url), ...post.links].find((u) => onSourceDomain(u, source.websiteDomains));
  if (page) return page;
  if (miniApp) return miniApp.url.replace(/^http:/, "https:");
  return source.handle ? `https://t.me/${source.handle}/${post.messageId}` : post.buttons[0]?.url ?? post.links[0] ?? "";
}

const MAX_YEARS = 40;

/** Sources whose employer type is known: always (AU) or as a fallback when extraction can't tell (ReliefWeb). */
const SOURCE_EMPLOYER_TYPE: Record<string, { type: string; override: boolean }> = {
  african_union: { type: "international_org", override: true },
  reliefweb: { type: "ngo", override: false },
};

function resolveEmployerType(extracted: string | null, sourceId: string): string | null {
  const known = SOURCE_EMPLOYER_TYPE[sourceId];
  if (known?.override) return known.type;
  return extracted ?? known?.type ?? null;
}

export function normalizeJob(
  j: ExtractedJob,
  ctx: { source: SourceContext; post: PostContext; taxonomy: TaxonomyIds; now?: Date },
): JobDraft | null {
  const title = j.title ?? j.raw_title;
  const summary = j.summary?.trim();
  if (!title || !summary) return null;

  const { taxonomy } = ctx;
  const professionId = j.profession_id && taxonomy.professionToFunction.has(j.profession_id) ? j.profession_id : null;
  const functionId =
    (professionId && taxonomy.professionToFunction.get(professionId)) ||
    (j.function_id && taxonomy.functionIds.has(j.function_id) ? j.function_id : null);

  let expMin = j.experience_min_years;
  let expMax = j.experience_max_years;
  if (expMin !== null && expMin > MAX_YEARS) expMin = null;
  if (expMax !== null && expMax > MAX_YEARS) expMax = null;
  if (expMin !== null && expMax !== null && expMax < expMin) [expMin, expMax] = [expMax, expMin];

  const flags = j.flags.filter((f): f is (typeof FLAG_IDS)[number] => (FLAG_IDS as readonly string[]).includes(f));
  const isOverseas = flags.includes("overseas") || (!!j.country && !/ethiopia/i.test(j.country));
  if (isOverseas && !flags.includes("overseas")) flags.push("overseas");

  // Apply: never treat a job-board page as the employer's link.
  let applyMethod: string = j.apply.method;
  let applyUrl = j.apply.url;
  if (applyUrl && (isJobBoardUrl(applyUrl, ctx.source.websiteDomains) || !/^https?:\/\//i.test(applyUrl))) applyUrl = null;
  const applyEmail = j.apply.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(j.apply.email) ? j.apply.email.toLowerCase() : null;
  const applyTelegram = j.apply.telegram?.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "") || null;
  if (applyMethod === "url" && !applyUrl) applyMethod = applyEmail ? "email" : "source";
  if (applyMethod === "email" && !applyEmail) applyMethod = applyUrl ? "url" : "source";
  if (applyMethod === "telegram" && !applyTelegram) applyMethod = "source";

  const deadline = resolveDeadline(j.deadline);
  const now = ctx.now ?? new Date();
  const status: JobDraft["status"] =
    flags.includes("suspicious") || flags.includes("fee_required") || (!professionId && !functionId)
      ? "review"
      : deadline && deadline < now
        ? "expired"
        : "active";

  const salary = j.salary;
  return {
    title: title.slice(0, 200),
    rawTitle: (j.raw_title ?? title).slice(0, 300),
    company: j.company?.slice(0, 200) ?? null,
    companyKey: companyKey(j.company),
    professionId,
    functionId,
    fieldOfStudyIds: j.field_of_study_ids.filter((id) => taxonomy.fieldOfStudyIds.has(id)),
    educationLevel: j.education_level,
    experienceMin: expMin,
    experienceMax: expMax,
    employmentType: j.employment_type,
    workMode: j.work_mode,
    locationIds: [...new Set(j.city_ids.filter((id) => CITY_IDS.has(id)))],
    locationRaw: j.location_raw?.slice(0, 300) ?? null,
    isOverseas,
    country: isOverseas ? j.country : null,
    employerType: resolveEmployerType(j.employer_type, ctx.source.id),
    positions: j.positions,
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency ?? null,
    salaryPeriod: salary?.period ?? null,
    salaryRaw: salary?.raw?.slice(0, 200) ?? null,
    genderReq: j.gender,
    deadline,
    deadlineRaw: j.deadline?.raw?.slice(0, 200) ?? null,
    summary: summary.slice(0, 700),
    roleBrief: roleBriefOf(j.role_brief),
    skills: [...new Set(j.skills.map((s) => s.trim()).filter(Boolean))].slice(0, 8),
    requirements: [...new Set(j.requirements.map((s) => s.trim().slice(0, 160)).filter(Boolean))].slice(0, 6),
    applyMethod,
    applyUrl,
    applyEmail,
    applyTelegram,
    applyPhone: j.apply.phone,
    applyNotes: j.apply.notes?.slice(0, 500) ?? null,
    sourceUrl: chooseSourceUrl(ctx.source, ctx.post),
    qualityFlags: flags,
    status,
  };
}

/** "junior-accountant-kerchanshe-trading-a1b2c3" */
export function jobSlug(title: string, company: string | null, id: string): string {
  const base = `${title} ${company ?? ""}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return `${base || "job"}-${id.replace(/-/g, "").slice(0, 6)}`;
}

/** "to design and maintain web apps." → "design and maintain web apps"; null when empty or too long to read as one line. */
export function roleBriefOf(raw: string | null | undefined): string | null {
  const t = raw?.trim().replace(/^to\s+/i, "").replace(/[.\s]+$/, "").replace(/\s+/g, " ");
  if (!t || t.length < 8 || t.length > 180) return null;
  return t.charAt(0).toLowerCase() + t.slice(1);
}
