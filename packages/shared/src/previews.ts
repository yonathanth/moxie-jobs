import type { InlineButton } from "./alert-card";
import { premiumBucket } from "./enums";

/**
 * Previews for matches the free plan doesn't send in full. Pure, so the copy is unit-tested.
 *   over the daily limit  → a short text preview (title, kind of employer, place, deadline) + See job / Get Pro
 *   NGO, UN/AU/embassy, international company, abroad → a picture preview, sent the moment it matches
 *   every morning          → the jobs they missed yesterday (at most 10, title and employer) + See jobs / Get Pro
 * Never says "premium" to people: it names the kind of job. Links are also in the text (t.me deep links
 * that open the Mini App), so they work even where buttons don't show.
 */

/** Start of today in Addis Ababa (UTC+3, no DST). */
export function startOfDayEat(now: Date): Date {
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - 3 * 3_600_000);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Addis_Ababa" });
const cut = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

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

const startApp = (l: PreviewLinks, param: string) => (l.bot ? `${l.bot}?startapp=${param}` : null);
const link = (href: string | null, text: string) => (href ? `<a href="${href}">${text}</a>` : text);
const appButton = (l: PreviewLinks, text: string, path: string): InlineButton[] => (l.app ? [{ text, web_app: { url: `${l.app.replace(/\/$/, "")}${path}` } }] : []);

export interface PreviewJob {
  id: string;
  title: string;
  /** Kind of employer as shown on cards ("NGO", "Embassy"), never the name. */
  employerLabel: string | null;
  location: string | null;
  deadline: Date | null;
}

function facts(job: PreviewJob): string | null {
  const parts = [job.employerLabel, job.location, job.deadline ? `apply by ${day(job.deadline)}` : null].filter(Boolean) as string[];
  return parts.length ? esc(parts.join(" · ")) : null;
}

/** A match over the free daily limit: what it is, not who or how to apply. Opens in the app tomorrow. */
export function overLimitPreview(job: PreviewJob, dailyCap: number, l: PreviewLinks): { text: string; buttons: InlineButton[][] } {
  const meta = facts(job);
  const text = [
    `<b>New match: ${esc(job.title)}</b>`,
    ...(meta ? [meta] : []),
    "",
    `You've had your ${dailyCap} free job alerts for today, so this one is a preview. ${link(startApp(l, "plans"), "Get Pro")} to see the employer and how to apply now, or ${link(startApp(l, `job_${job.id}`), "open it in the app")} tomorrow for free.`,
  ].join("\n");
  const row = [...appButton(l, "See job", `/app/jobs/${job.id}`), ...appButton(l, "Get Pro", "/app/plans")];
  return { text, buttons: row.length ? [row] : [] };
}

/** An NGO, UN/AU/embassy, international company or abroad job the free plan doesn't include: a picture preview. */
export function kindMatchPreview(
  job: PreviewJob & { employerType: string | null; isOverseas: boolean },
  l: PreviewLinks,
): { image: string; caption: string; buttons: InlineButton[][] } {
  const kind = jobKindLabel(job) ?? "job";
  const meta = [job.location, job.deadline ? `apply by ${day(job.deadline)}` : null].filter(Boolean) as string[];
  const caption = [
    `<b>New ${kind} for you</b>`,
    "",
    `<b>${esc(job.title)}</b>`,
    ...(meta.length ? [esc(meta.join(" · "))] : []),
    "",
    `The employer and how to apply are for Pro members. ${link(startApp(l, "plans"), "Get Pro")} to see the details and apply, or ${link(startApp(l, `job_${job.id}`), "see the job")}.`,
  ].join("\n");
  const row = [...appButton(l, "See job", `/app/jobs/${job.id}`), ...appButton(l, "Get Pro to see details", "/app/plans")];
  return { image: `/og/msg/premium?job=${job.id}`, caption, buttons: row.length ? [row] : [] };
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
