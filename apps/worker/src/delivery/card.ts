import {
  applyHowText,
  applyTarget,
  deadlineText,
  educationText,
  employerLabel,
  experienceText,
  genderText,
  jobTypeText,
  locationText,
  notStated,
  salaryText,
  type ApplyFields,
  type JobFacts,
} from "@ethio/shared";

/**
 * The job alert message. Pure. No emoji; labelled facts with a blank line
 * between each, so the card reads easily. Buttons:
 *   [ Apply | View job ] [ Similar jobs ]   Apply = exact application link; View job = the original post
 *   [ Get a CV tailored to this job ]
 * "Similar jobs" (same profession, else category) and the CV button open the
 * Mini App (needs https); on http (local dev) they fall back to callbacks the bot answers.
 */

export interface CardJob extends JobFacts, ApplyFields {
  id: string;
  summary: string;
  firstSeenAt: Date;
}

export interface InlineButton {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
}

export interface Card {
  text: string;
  buttons: InlineButton[][];
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Callback data (≤ 64 bytes), used when the Mini App can't open (http in local dev). */
export const MORE_JOBS_CALLBACK = "mj";
export function cvCallback(deliveryId: string): string {
  return `cv:${deliveryId}`;
}

export function buildCard(
  job: CardJob,
  opts: {
    sourceTitle: string;
    deliveryId: string;
    /** Names of the fields of study the job asks for. */
    fieldNames?: string[];
    /** Mini App base URL; Mini App buttons need https. */
    webAppUrl?: string | null;
    /** API base URL; with https, Apply goes through the click-tracking redirect. */
    publicApiUrl?: string | null;
    now?: Date;
  },
): Card {
  const now = opts.now ?? new Date();
  const e = escapeHtml;
  const lines: string[] = [`<b>${e(job.title)}</b>`];
  const who = [job.company, employerLabel(job.employerType)].filter(Boolean).join(" · ");
  if (who) lines.push(e(who));

  const facts: [string, string | null][] = [
    ["Location", locationText(job)],
    ["Experience", experienceText(job.experienceMin, job.experienceMax)],
    ["Education", educationText(job.educationLevel, opts.fieldNames)],
    ["Job type", jobTypeText(job.employmentType, job.positions)],
    ["Salary", salaryText(job.salaryRaw, (job.qualityFlags ?? []).includes("unpaid"))],
    ["Deadline", job.deadline ? deadlineText(job.deadline, now) : null],
    ["Gender", genderText(job.genderReq)],
  ];
  for (const [label, value] of facts) if (value) lines.push("", `<b>${label}:</b> ${e(value)}`);

  lines.push("", e(job.summary));

  const how = applyHowText(job);
  if (how) lines.push("", `<b>How to apply:</b> ${e(how)}`);

  const missing = notStated(job);
  lines.push("");
  if (missing.length) lines.push(`<i>Not stated: ${e(missing.join(", "))}</i>`);
  lines.push(`<i>via ${e(opts.sourceTitle)}</i>`);

  const app = opts.webAppUrl?.startsWith("https://") ? opts.webAppUrl : null;
  const target = applyTarget(job);
  const applyUrl = opts.publicApiUrl?.startsWith("https://")
    ? new URL(`/r/${opts.deliveryId}`, opts.publicApiUrl).toString()
    : /^https?:\/\//i.test(target.url)
      ? target.url
      : null;

  const row: InlineButton[] = [];
  if (applyUrl) row.push({ text: target.label, url: applyUrl });
  row.push(
    app
      ? { text: "Similar jobs", web_app: { url: `${new URL("/app/jobs", app).toString()}?scope=all&similar=${job.id}` } }
      : { text: "Similar jobs", callback_data: MORE_JOBS_CALLBACK },
  );
  const cvText = "Get a CV tailored to this job";
  const cv: InlineButton = app
    ? { text: cvText, web_app: { url: `${new URL("/app/cvs/new", app).toString()}?mode=tailor&jobId=${job.id}` } }
    : { text: cvText, callback_data: cvCallback(opts.deliveryId) };
  return { text: lines.join("\n"), buttons: [row, [cv]] };
}
