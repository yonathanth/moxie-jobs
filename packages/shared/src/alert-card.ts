import type { ApplyFields } from "./apply";
import { deadlineText, educationText, employerLabel, experienceText, genderText, jobTypeText, locationText, notStated, salaryText, type JobFacts } from "./jobs";

/**
 * The job alert message. Pure. No emoji; labelled facts with a blank line
 * between each, so the card reads easily. Requirements and how to apply are
 * not in it (they are on the Mini App job page).
 * Two buttons side by side, both opening the Mini App (needs https):
 *   [ See details ] [ More jobs ]   the job's page / the For you feed
 * On http (local dev) they fall back to callbacks the bot answers.
 */

export interface CardJob extends JobFacts, ApplyFields {
  id: string;
  summary: string;
  firstSeenAt: Date;
  requirements?: string[];
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Callback data (≤ 64 bytes), used when the Mini App can't open (http in local dev). */
export const MORE_JOBS_CALLBACK = "mj";
/** "See details" when the Mini App can't open: the bot answers with how to apply and the link. */
export function detailsCallback(deliveryId: string): string {
  return `ap:${deliveryId}`;
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

  const missing = notStated(job);
  lines.push("");
  if (missing.length) lines.push(`<i>Not stated: ${e(missing.join(", "))}</i>`);
  lines.push(`<i>via ${e(opts.sourceTitle)}</i>`);

  const app = opts.webAppUrl?.startsWith("https://") ? (opts.webAppUrl.endsWith("/") ? opts.webAppUrl.slice(0, -1) : opts.webAppUrl) : null;
  const row: InlineButton[] = app
    ? [
        { text: "See details", web_app: { url: `${app}/app/jobs/${job.id}` } },
        { text: "More jobs", web_app: { url: `${app}/app/jobs?scope=for_you` } },
      ]
    : [
        { text: "See details", callback_data: detailsCallback(opts.deliveryId) },
        { text: "More jobs", callback_data: MORE_JOBS_CALLBACK },
      ];
  return { text: lines.join("\n"), buttons: [row] };
}
