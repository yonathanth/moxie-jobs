import type { InlineButton } from "./alert-card";
import { EMPLOYMENT_TYPES, premiumBucket } from "./enums";
import { isUnpaidJob, locationText, salaryText, type JobFacts } from "./jobs";

/**
 * Previews for matches the free plan doesn't send in full. Pure, so the copy is unit-tested.
 *   over the daily limit  → text: "New match: <title>", a sentence ("A company is hiring a part-time Accountant to …"),
 *                            place · deadline · salary, then one link and one button (Get Pro to see details)
 *   NGO, international organization, embassy, international company, abroad → the same under a picture,
 *                            ending "NGO jobs are for Pro members." (the specific kind)
 *   every morning          → the jobs they missed yesterday (at most 10, title and employer) + See jobs / Get Pro
 * Never the employer's name, requirements, experience, education or how to apply. Never says "premium" to people.
 * The link in the text is a t.me deep link that opens the Mini App, so it works even where buttons don't show.
 */

/** Start of today in Addis Ababa (UTC+3, no DST). */
export function startOfDayEat(now: Date): Date {
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - 3 * 3_600_000);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Addis_Ababa" });
const cut = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
const employmentLabel = new Map<string, string>(EMPLOYMENT_TYPES.map((e) => [e.id, e.label]));

/** Where previews link: the Mini App base (https, for buttons) and the bot's t.me link (for links in the text). */
export interface PreviewLinks {
  /** Mini App base URL when it is https, else null (buttons fall back to none). */
  app: string | null;
  /** https://t.me/<bot>, or null when unknown (then the text carries no links). */
  bot: string | null;
}

type Kind = "ngo" | "international_org" | "embassy" | "foreign_company" | "overseas";

/** The kinds the free plan doesn't include, one by one (not grouped: we never say "UN" or "AU" when we only know it's an international organization). */
function kindOf(job: { employerType: string | null; isOverseas: boolean }): Kind | null {
  if (!premiumBucket(job)) return null;
  if (job.isOverseas) return "overseas";
  return job.employerType as Kind;
}

const KIND_JOB: Record<Kind, string> = {
  ngo: "NGO job",
  international_org: "international organization job",
  embassy: "embassy job",
  foreign_company: "international company job",
  overseas: "job abroad",
};

/** Who these jobs are for: "NGO jobs are for Pro members." */
const KIND_JOBS: Record<Kind, string> = {
  ngo: "NGO jobs",
  international_org: "International organization jobs",
  embassy: "Embassy jobs",
  foreign_company: "International company jobs",
  overseas: "Jobs abroad",
};

/** The kind of job, for people: "NGO job", "embassy job", "job abroad"…; null for kinds every plan gets. */
export function jobKindLabel(job: { employerType: string | null; isOverseas: boolean }): string | null {
  const kind = kindOf(job);
  return kind ? KIND_JOB[kind] : null;
}

/** Who is hiring, without naming them: "An NGO", "A company", "An employer in Qatar". */
export function hirerPhrase(job: { employerType: string | null; isOverseas: boolean; country?: string | null }): string {
  if (job.isOverseas) return job.country ? `An employer in ${job.country}` : "An employer abroad";
  switch (job.employerType) {
    case "ngo":
      return "An NGO";
    case "international_org":
      return "An international organization";
    case "embassy":
      return "An embassy";
    case "foreign_company":
      return "An international company";
    case "government":
      return "A government office";
    case "local_private":
      return "A company";
    default:
      return "An employer";
  }
}

const startApp = (l: PreviewLinks, param: string) => (l.bot ? `${l.bot}?startapp=${param}` : null);
const link = (href: string | null, text: string) => (href ? `<a href="${href}">${text}</a>` : text);
const appButton = (l: PreviewLinks, text: string, path: string): InlineButton[] => (l.app ? [{ text, web_app: { url: `${l.app.replace(/\/$/, "")}${path}` } }] : []);

/** What a preview may show: never the employer's name, requirements or how to apply. */
export interface PreviewJob {
  id: string;
  title: string;
  /** "An NGO", "A company" (`hirerPhrase`). */
  hirer: string;
  /** "part-time", "contract"… (full-time too) when stated. */
  jobType?: string | null;
  /** "remote" or "hybrid". */
  workMode?: string | null;
  /** What the person will do (`Job.roleBrief`), a verb phrase. */
  brief?: string | null;
  location: string | null;
  deadline: Date | null;
  /** Only when the post states a figure. */
  salary?: string | null;
}

/** Builds a PreviewJob from a stored job. */
export function previewJobOf(job: JobFacts & { id: string; roleBrief?: string | null }): PreviewJob {
  return {
    id: job.id,
    title: job.title,
    hirer: hirerPhrase(job),
    jobType: job.employmentType ? employmentLabel.get(job.employmentType)?.toLowerCase() ?? null : null,
    workMode: job.workMode === "remote" || job.workMode === "hybrid" ? job.workMode : null,
    brief: job.roleBrief ?? null,
    location: locationText(job),
    deadline: job.deadline,
    salary: salaryText(job.salaryRaw, isUnpaidJob(job)),
  };
}

/**
 * "A company is hiring a part-time remote Junior Software Engineer to design and maintain web apps."
 * Without a brief: "An NGO is looking for a Finance Officer."
 */
export function previewSentence(job: PreviewJob): string {
  const role = [job.jobType, job.workMode, job.title].filter(Boolean).join(" ");
  const article = /^[aeiou]/i.test(role) ? "an" : "a";
  return job.brief ? `${job.hirer} is hiring ${article} ${role} to ${job.brief}.` : `${job.hirer} is looking for ${article} ${role}.`;
}

/** Place · deadline · salary, one line; null when none is known. */
function factLine(job: PreviewJob): string | null {
  const parts = [job.location, job.deadline ? `apply by ${day(job.deadline)}` : null, job.salary ? `Salary: ${cut(job.salary, 60)}` : null].filter(Boolean);
  return parts.length ? esc(parts.join(" · ")) : null;
}

/** "New match: <title>", blank, the sentence, blank, place · deadline · salary, blank, then the ending. */
function body(job: PreviewJob, ending: string[]): string {
  const fact = factLine(job);
  return [`<b>New match: ${esc(job.title)}</b>`, "", esc(cut(previewSentence(job), 400)), ...(fact ? ["", fact] : []), "", ...ending].join("\n");
}

const proLine = (l: PreviewLinks) => `${link(startApp(l, "plans"), "Subscribe to Pro")} to see who's hiring and apply.`;
const proButton = (l: PreviewLinks): InlineButton[][] => {
  const row = appButton(l, "Get Pro to see details", "/app/plans");
  return row.length ? [row] : [];
};

/** A match over the free daily limit: what it is, not who or how to apply. Opens in the app tomorrow. */
export function overLimitPreview(job: PreviewJob, dailyCap: number, l: PreviewLinks): { text: string; buttons: InlineButton[][] } {
  return { text: body(job, [`You've reached your ${dailyCap} free jobs for today.`, proLine(l)]), buttons: proButton(l) };
}

/** An NGO, international organization, embassy, international company or abroad job the free plan doesn't include: a picture preview. */
export function kindMatchPreview(
  job: PreviewJob & { employerType: string | null; isOverseas: boolean },
  l: PreviewLinks,
): { image: string; caption: string; buttons: InlineButton[][] } {
  const kind = kindOf(job);
  const caption = body(job, [`${kind ? KIND_JOBS[kind] : "These jobs"} are for Pro members.`, proLine(l)]);
  return { image: `/og/msg/premium?job=${job.id}`, caption, buttons: proButton(l) };
}

export interface MissedJob {
  title: string;
  /** Company name, or the kind of employer when the plan hides the name. */
  who: string | null;
}

/** Telegram's caption limit is 1024 characters of visible text; stay under it. */
const CAPTION_MAX = 1000;
export const MISSED_DIGEST_MAX = 10;

/**
 * The morning message: jobs that matched yesterday but weren't sent in full (over the limit, or a kind the
 * plan doesn't include). At most 10, title and employer. Null when there's nothing.
 */
export function missedDigest(jobs: MissedJob[], total: number, dailyCap: number | null, l: PreviewLinks): { image: string; caption: string; buttons: InlineButton[][] } | null {
  if (!jobs.length || total <= 0) return null;
  const visible = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt);/g, "x").length;
  const head = [`<b>You missed ${total} matching ${total === 1 ? "job" : "jobs"} yesterday</b>`, ""];
  const foot = (more: number) => [
    ...(more > 0 ? [`…and ${more} more.`] : []),
    "",
    `${link(startApp(l, "jobs"), "See them in the app")}, or ${link(startApp(l, "plans"), "get Pro")} to get every match the moment it's posted${dailyCap ? `, not just ${dailyCap} a day` : ""}.`,
  ];
  let shown = jobs.slice(0, MISSED_DIGEST_MAX);
  const build = () => {
    const lines = shown.map((j, i) => `${i + 1}. <b>${esc(cut(j.title, 70))}</b>${j.who ? ` · ${esc(cut(j.who, 40))}` : ""}`);
    return [...head, ...lines, ...foot(total - shown.length)].join("\n");
  };
  let caption = build();
  while (visible(caption) > CAPTION_MAX && shown.length > 1) {
    shown = shown.slice(0, -1);
    caption = build();
  }
  const row = [...appButton(l, "See jobs", "/app/jobs?scope=for_you"), ...appButton(l, "Get Pro", "/app/plans")];
  return { image: `/og/msg/missed?n=${Math.min(total, 999)}`, caption, buttons: row.length ? [row] : [] };
}
