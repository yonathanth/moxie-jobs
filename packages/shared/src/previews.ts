import type { InlineButton } from "./alert-card";
import { EMPLOYMENT_TYPES, premiumBucket } from "./enums";
import { educationText, experienceText, isUnpaidJob, locationText, salaryText, type JobFacts } from "./jobs";

/**
 * Previews for matches the free plan doesn't send in full. Pure, so the copy is unit-tested.
 *   over the daily limit  → "New match: <title>", a few facts, one link and one button (Get Pro to see details)
 *   NGO, UN/AU/embassy, international company, abroad → a picture with "An NGO is hiring: <title>", same structure
 *   every morning          → the jobs they missed yesterday (at most 10, title and employer) + See jobs / Get Pro
 * Facts answer "is this for me?" (place, job type, deadline, experience, education, stated pay, openings), never
 * "who" or "how to apply". Never says "premium" to people: it names the kind of job. The link in the text is a
 * t.me deep link that opens the Mini App, so it works even where buttons don't show.
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

/** The kind of job, for people: "NGO job", "UN, AU or embassy job", "international company job", "job abroad". */
export function jobKindLabel(job: { employerType: string | null; isOverseas: boolean }): string | null {
  switch (premiumBucket(job)) {
    case "ngo":
      return "NGO job";
    case "intl":
      return "UN, AU or embassy job";
    case "foreign":
      return "international company job";
    case "overseas":
      return "job abroad";
    default:
      return null;
  }
}

/** Who is hiring, without naming them, and who those jobs are for: "An NGO is hiring" / "NGO jobs are for Pro members." */
const KIND_COPY = {
  ngo: { who: "An NGO", jobs: "NGO jobs" },
  intl: { who: "A UN, AU or embassy office", jobs: "UN, AU and embassy jobs" },
  foreign: { who: "An international company", jobs: "International company jobs" },
  overseas: { who: "A company abroad", jobs: "Jobs abroad" },
} as const;

const startApp = (l: PreviewLinks, param: string) => (l.bot ? `${l.bot}?startapp=${param}` : null);
const link = (href: string | null, text: string) => (href ? `<a href="${href}">${text}</a>` : text);
const appButton = (l: PreviewLinks, text: string, path: string): InlineButton[] => (l.app ? [{ text, web_app: { url: `${l.app.replace(/\/$/, "")}${path}` } }] : []);

/** What a preview may show: never the employer's name or how to apply. */
export interface PreviewJob {
  id: string;
  title: string;
  location: string | null;
  deadline: Date | null;
  /** "Full-time", "Contract"… when stated. */
  jobType?: string | null;
  /** "3+ years", "Fresh graduates". */
  experience?: string | null;
  /** "Bachelor's degree in Accounting". */
  education?: string | null;
  /** Only when the post states a figure. */
  salary?: string | null;
  openings?: number | null;
}

/** Builds a PreviewJob from a stored job (field names come from the taxonomy). */
export function previewJobOf(job: JobFacts & { id: string; fieldOfStudyIds?: string[] }, fieldNames: Map<string, string> = new Map()): PreviewJob {
  const fields = (job.fieldOfStudyIds ?? []).filter((id) => id !== "any_field").map((id) => fieldNames.get(id) ?? "").filter(Boolean);
  return {
    id: job.id,
    title: job.title,
    location: locationText(job),
    deadline: job.deadline,
    jobType: job.employmentType ? employmentLabel.get(job.employmentType) ?? null : null,
    experience: experienceText(job.experienceMin, job.experienceMax),
    education: educationText(job.educationLevel, fields),
    salary: salaryText(job.salaryRaw, isUnpaidJob(job)),
    openings: job.positions,
  };
}

/** Up to 3 short lines of facts; lines with nothing to say are left out. */
function factLines(job: PreviewJob): string[] {
  const lines = [
    [job.location, job.jobType, job.deadline ? `apply by ${day(job.deadline)}` : null],
    [job.experience, job.education ? cut(job.education, 70) : null],
    [job.salary ? `Salary: ${cut(job.salary, 60)}` : null, job.openings && job.openings > 1 ? `${job.openings} openings` : null],
  ];
  return lines.map((parts) => parts.filter(Boolean).join(" · ")).filter(Boolean).map(esc);
}

const proLine = (l: PreviewLinks) => `${link(startApp(l, "plans"), "Subscribe to Pro")} to see who's hiring and apply.`;
const proButton = (l: PreviewLinks): InlineButton[][] => {
  const row = appButton(l, "Get Pro to see details", "/app/plans");
  return row.length ? [row] : [];
};

/** A match over the free daily limit: what it is, not who or how to apply. Opens in the app tomorrow. */
export function overLimitPreview(job: PreviewJob, dailyCap: number, l: PreviewLinks): { text: string; buttons: InlineButton[][] } {
  const text = [`<b>New match: ${esc(job.title)}</b>`, ...factLines(job), "", `You've reached your ${dailyCap} free jobs for today.`, proLine(l)].join("\n");
  return { text, buttons: proButton(l) };
}

/** An NGO, UN/AU/embassy, international company or abroad job the free plan doesn't include: a picture preview. */
export function kindMatchPreview(
  job: PreviewJob & { employerType: string | null; isOverseas: boolean },
  l: PreviewLinks,
): { image: string; caption: string; buttons: InlineButton[][] } {
  const bucket = premiumBucket(job);
  const copy = bucket ? KIND_COPY[bucket] : { who: "An employer", jobs: "These jobs" };
  const caption = [`<b>${copy.who} is hiring: ${esc(job.title)}</b>`, ...factLines(job), "", `${copy.jobs} are for Pro members.`, proLine(l)].join("\n");
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
