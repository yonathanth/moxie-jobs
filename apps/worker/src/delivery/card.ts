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
 * between each, so the card reads easily. Requirements and how to apply
 * (with the application link or the original post) are in the text.
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

export function escapeHtml(text: string): string {
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

  const requirements = job.requirements ?? [];
  if (requirements.length) lines.push("", "<b>Requirements:</b>", ...requirements.map((r) => `• ${e(r)}`));

  const target = applyTarget(job);
  // Click tracking (/r/:deliveryId) needs a public https API; otherwise link straight to the target.
  const applyUrl = opts.publicApiUrl?.startsWith("https://")
    ? new URL(`/r/${opts.deliveryId}`, opts.publicApiUrl).toString()
    : /^https?:\/\//i.test(target.url)
      ? target.url
      : null;
  lines.push("", `<b>How to apply:</b> ${howToApply(job, target.label, applyUrl, opts.sourceTitle)}`);

  const missing = notStated(job);
  lines.push("");
  if (missing.length) lines.push(`<i>Not stated: ${e(missing.join(", "))}</i>`);
  lines.push(`<i>via ${e(opts.sourceTitle)}</i>`);

  const app = opts.webAppUrl?.startsWith("https://") ? opts.webAppUrl : null;
  const row: InlineButton[] = app
    ? [
        { text: "See details", web_app: { url: new URL(`/app/jobs/${job.id}`, app).toString() } },
        { text: "More jobs", web_app: { url: `${new URL("/app/jobs", app).toString()}?scope=for_you` } },
      ]
    : [
        { text: "See details", callback_data: detailsCallback(opts.deliveryId) },
        { text: "More jobs", callback_data: MORE_JOBS_CALLBACK },
      ];
  return { text: lines.join("\n"), buttons: [row] };
}

/** "Send your CV to hr@x.com." plus the link: the application page, or the original post when that's all there is. */
function howToApply(job: CardJob, label: string, url: string | null, sourceTitle: string): string {
  const e = escapeHtml;
  const how = applyHowText(job);
  const exact = label === "Apply";
  const link = url ? `<a href="${e(url).replace(/"/g, "&quot;")}">${exact ? "Apply online" : "original post"}</a>` : null;
  if (how) {
    if (!link) return e(how);
    return exact ? `${e(how)}\n${link}` : `${e(how)}. Details in the ${link}.`;
  }
  if (exact) return link ? link : "Apply online through the employer's link.";
  return link ? `Follow the instructions in the ${link}.` : `Follow the instructions in the original post on ${e(sourceTitle)}.`;
}
