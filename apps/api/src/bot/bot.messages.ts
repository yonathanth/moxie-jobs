import type { InlineKeyboardButton, InlineKeyboardMarkup } from "grammy/types";

/** Bot copy and keyboards. Pure (no I/O) so it is easy to test and edit. */

export const BOT_COMMANDS = [
  { command: "start", description: "Start / open GoMoxie Jobs" },
  { command: "jobs", description: "Open my job feed" },
  { command: "settings", description: "Edit what jobs I get" },
  { command: "pause", description: "Pause job alerts" },
  { command: "resume", description: "Resume job alerts" },
  { command: "help", description: "How this works" },
];

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mini App buttons need an https URL; in local http dev we fall back to no button. */
export function webAppButton(text: string, baseUrl: string, path: string): InlineKeyboardButton | null {
  if (!baseUrl.startsWith("https://")) return null;
  return { text, web_app: { url: new URL(path, baseUrl).toString() } };
}

export function keyboard(...rows: (InlineKeyboardButton | null)[][]): InlineKeyboardMarkup | undefined {
  const clean = rows.map((r) => r.filter((b): b is InlineKeyboardButton => b !== null)).filter((r) => r.length);
  return clean.length ? { inline_keyboard: clean } : undefined;
}

export interface Reply {
  text: string;
  reply_markup?: InlineKeyboardMarkup;
}

const devHint = (baseUrl: string) =>
  baseUrl.startsWith("https://") ? "" : `\n\n<i>(dev: open ${escapeHtml(baseUrl)}/app in a browser)</i>`;

export function welcomeNew(firstName: string | null, webAppUrl: string): Reply {
  const name = firstName ? `, ${escapeHtml(firstName)}` : "";
  return {
    // The wave is the one emoji the bot uses (the user asked for it on the greeting).
    text:
      `👋 <b>Selam${name}!</b>\n\n` +
      "<b>Here's what I'll do for you:</b>\n" +
      "• Only the jobs that match your preferences, the moment they're posted\n" +
      "• Create and improve your CVs\n" +
      "• A CV tailored to every job you apply for\n\n" +
      "Set up your preferences to get started. It takes about a minute." +
      devHint(webAppUrl),
    reply_markup: keyboard([webAppButton("Set up my preferences", webAppUrl, "/app/onboarding")]),
  };
}

export function welcomeBack(firstName: string | null, webAppUrl: string, paused: boolean): Reply {
  const name = firstName ? `, ${escapeHtml(firstName)}` : "";
  const status = paused
    ? "Your alerts are <b>paused</b>. Send /resume to turn them back on."
    : "Your alerts are <b>on</b>. I'll message you when matching jobs come in.";
  return {
    text: `<b>Welcome back${name}!</b>\n\n${status}` + devHint(webAppUrl),
    reply_markup: keyboard(
      [webAppButton("Open my jobs", webAppUrl, "/app/jobs")],
      [webAppButton("Edit preferences", webAppUrl, "/app/preferences")],
    ),
  };
}

export function settingsReply(webAppUrl: string): Reply {
  return {
    text: "Change your professions, field of study, experience, salary or locations here:" + devHint(webAppUrl),
    reply_markup: keyboard([webAppButton("Edit preferences", webAppUrl, "/app/preferences")]),
  };
}

export function jobsReply(webAppUrl: string): Reply {
  return {
    text: "Search and filter every open job, and see all your matches, in your feed:" + devHint(webAppUrl),
    reply_markup: keyboard([webAppButton("Open my jobs", webAppUrl, "/app/jobs")]),
  };
}

export function needsOnboarding(webAppUrl: string): Reply {
  return {
    text: "First, set up your preferences so I know which jobs to send you. It takes about a minute." + devHint(webAppUrl),
    reply_markup: keyboard([webAppButton("Set up my preferences", webAppUrl, "/app/onboarding")]),
  };
}

export const PAUSED_TEXT = "Job alerts paused. Send /resume whenever you want them back.";
export const RESUMED_TEXT = "Job alerts are back on.";

export const HELP_TEXT =
  "<b>How GoMoxie Jobs works</b>\n\n" +
  "1. Tell me your profession, field of study, experience and where you want to work.\n\n" +
  "2. I collect new jobs from Ethiopian job channels and websites around the clock.\n\n" +
  "3. When a job fits you, I send it here with a button to apply.\n\n" +
  "/jobs – open your job feed\n" +
  "/settings – change what jobs you get\n" +
  "/pause, /resume – stop or restart alerts";

export const FALLBACK_TEXT = "I don't read messages yet. Use the menu, or send /help.";

export function preferencesSaved(firstTime: boolean, webAppUrl: string): Reply {
  if (firstTime) {
    return {
      text:
        "<b>You're all set!</b>\n\n" +
        "Your first matching jobs are on their way. After that, I'll send new ones as soon as they're posted.\n\n" +
        "You can change your preferences anytime with /settings.",
      reply_markup: keyboard([webAppButton("Open my jobs", webAppUrl, "/app/jobs")]),
    };
  }
  return { text: "Preferences updated. New alerts will follow your changes." };
}

/** What the plan now gives, from its live limits ("Matching NGO… jobs now arrive instantly, with no daily limit."). */
export function planPerks(l: { premiumJobs: boolean; dailyJobCap: number | null }): string {
  const what = l.premiumJobs ? "Matching jobs, including NGO, international and overseas ones," : "Matching jobs";
  const cap = l.dailyJobCap === null ? ", with no daily limit" : `, up to ${l.dailyJobCap} a day`;
  return `${what} now arrive instantly${cap}.`;
}

export function planActivated(planName: string, until: Date, webAppUrl: string, limits: { premiumJobs: boolean; dailyJobCap: number | null }): Reply {
  const date = new Date(until.getTime() + 3 * 3_600_000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    text:
      `<b>${escapeHtml(planName)} is active</b> until ${date}.\n\n` +
      planPerks(limits),
    reply_markup: keyboard([webAppButton("Make the most of it", webAppUrl, "/app/preferences")]),
  };
}

/** Answer to the Apply button on cards sent before buttons became direct links. */
export function applyPrompt(a: { title: string; closed: boolean; how: string | null; applyUrl: string | null; applyLabel: string }): Reply {
  if (a.closed) {
    return { text: `<b>${escapeHtml(a.title)}</b>\n\nThis job has closed. New matches keep coming as they're posted.` };
  }
  const lines = [`<b>${escapeHtml(a.title)}</b>`];
  if (a.how) lines.push("", `<b>How to apply:</b> ${escapeHtml(a.how)}`);
  const go: InlineKeyboardButton | null = a.applyUrl ? { text: a.applyLabel, url: a.applyUrl } : null;
  return { text: lines.join("\n"), reply_markup: keyboard([go]) };
}

/** Answer to "Get a CV tailored to this job" when the card can't open the Mini App directly. */
export function cvTailorPrompt(title: string, jobId: string, webAppUrl: string): Reply {
  return {
    text:
      `<b>A CV tailored to: ${escapeHtml(title)}</b>\n\n` +
      "We rewrite your CV around this job's requirements, using only what's true. No CV yet? Your first one is free." +
      devHint(webAppUrl),
    reply_markup: keyboard([webAppButton("Tailor my CV", webAppUrl, `/app/cvs/new?mode=tailor&jobId=${jobId}`)]),
  };
}

/** Someone opened a shared job link. New people also get the pitch for alerts. */
export function sharedJob(job: { id: string; title: string; company: string | null; closed: boolean }, webAppUrl: string, onboarded: boolean): Reply {
  const head = `<b>${escapeHtml(job.title)}</b>` + (job.company ? `\n${escapeHtml(job.company)}` : "");
  const body = job.closed
    ? "This job has closed, but new ones like it are posted every day."
    : "Open it to see the full details and how to apply.";
  const pitch = onboarded
    ? ""
    : "\n\nWant jobs like this sent to you the moment they're posted? Set up free alerts in about a minute.";
  return {
    text: `${head}\n\n${body}${pitch}` + devHint(webAppUrl),
    reply_markup: keyboard(
      [
        job.closed
          ? webAppButton("See similar jobs", webAppUrl, `/app/jobs?scope=all&similar=${job.id}`)
          : webAppButton("View job and apply", webAppUrl, `/app/jobs/${job.id}`),
      ],
      onboarded ? [] : [webAppButton("Get free job alerts", webAppUrl, "/app/onboarding")],
    ),
  };
}
