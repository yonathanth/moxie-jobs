import { CV_PACK_CONTENTS, CV_PACKS, PLAN_NAME, type CvPackId } from "./plans";

/**
 * The bot's marketing messages: a picture (drawn by the web app at `image`),
 * a short HTML caption and Mini App buttons (`path` under WEB_APP_URL).
 * Pure, shared by the worker (which sends them) and the API (admin preview).
 *
 *   upgrade  A   Pro: what you get                      free users
 *   cv       B1  make + tailor a CV (first ones free)    free users who still have their free CVs
 *   packs    B2  CV packs                               anyone out of CVs (free tiers / allowance used)
 *   cap      C   alert limit reached today               free users
 *   premium  D   a premium job matched (locked)          free users
 *   renew_*      plan ends soon / has ended             paid users
 */

export type PromoKind = "upgrade" | "cv" | "packs" | "cap" | "premium" | "renew_soon" | "renew_lapsed";

export interface BotPhotoMessage {
  /** Path (and query) of the picture on the web app, e.g. "/og/msg/upgrade?price=199". */
  image: string;
  caption: string;
  buttons: { text: string; path: string }[][];
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Addis_Ababa" });

export function upgradePromo(price: number): BotPhotoMessage {
  return {
    image: `/og/msg/upgrade?price=${price}`,
    caption: [
      "<b>Get every job that fits you, the moment it's posted</b>",
      "",
      "With Pro:",
      "• No daily limit on job alerts",
      "• NGO, UN, embassy and jobs abroad",
      "• New and tailored CVs every month",
      "",
      `From ${price} Br a month.`,
    ].join("\n"),
    buttons: [[{ text: "Get Pro", path: "/app/plans" }]],
  };
}

export function cvPromo(): BotPhotoMessage {
  return {
    image: "/og/msg/cv",
    caption: [
      "<b>A CV made for every job you apply to</b>",
      "",
      "Make your CV in a few minutes, then tailor it to any job in one tap. Your first CV and your first tailored CV are free.",
    ].join("\n"),
    buttons: [[{ text: "Make my CV", path: "/app/cvs" }, { text: "Tailor it to a job", path: "/app/jobs?scope=for_you" }]],
  };
}

export function packsPromo(prices: Record<CvPackId, number>): BotPhotoMessage {
  return {
    image: `/og/msg/packs?p=${CV_PACKS.map((id) => prices[id]).join(",")}`,
    caption: [
      "<b>More CVs, whenever you need them</b>",
      "",
      ...CV_PACKS.map((id) => {
        const p = CV_PACK_CONTENTS[id];
        return `• ${p.name}: ${p.newCvs} new and ${p.tailored} tailored CVs · ${prices[id]} Br`;
      }),
      "",
      "Credits never expire.",
    ].join("\n"),
    buttons: [[{ text: "See CV packs", path: "/app/plans#packs" }]],
  };
}

/** Matches held back today by the free daily limit. */
export function capPromo(waiting: number, dailyCap: number): BotPhotoMessage {
  return {
    image: `/og/msg/cap?n=${waiting}&cap=${dailyCap}`,
    caption: [
      `<b>${waiting} more ${waiting === 1 ? "job" : "jobs"} matched you today</b>`,
      "",
      `You've had your ${dailyCap} free alerts today. The rest are waiting in your feed.`,
      "",
      "Pro sends every match the moment it's posted, with no daily limit.",
    ].join("\n"),
    buttons: [[{ text: "Open my feed", path: "/app/jobs?scope=for_you" }, { text: "Get Pro", path: "/app/plans" }]],
  };
}

/** A premium job (NGO, UN/AU/embassy, international company, abroad) the free plan locked. Never names the employer. */
export function premiumPromo(job: { id: string; title: string; kind: string | null; location: string | null; deadline: Date | null }): BotPhotoMessage {
  const meta = [job.kind, job.location, job.deadline ? `apply by ${day(job.deadline)}` : null].filter(Boolean).join(" · ");
  return {
    image: `/og/msg/premium?job=${job.id}`,
    caption: [
      "<b>A premium job matched you</b>",
      "",
      `<b>${esc(job.title)}</b>`,
      ...(meta ? [esc(meta)] : []),
      "",
      "Pro shows the employer and how to apply, and sends jobs like this the moment they're posted.",
    ].join("\n"),
    buttons: [[{ text: "See the job", path: `/app/jobs/${job.id}` }, { text: "Unlock with Pro", path: "/app/plans" }]],
  };
}

export function renewPromo(plan: "pro" | "career", until: Date, lapsed: boolean): BotPhotoMessage {
  const name = PLAN_NAME[plan];
  return {
    image: `/og/msg/renew?plan=${plan}&until=${until.toISOString().slice(0, 10)}${lapsed ? "&lapsed=1" : ""}`,
    caption: lapsed
      ? [`<b>Your ${name} has ended</b>`, "", "You're back on the free plan: a daily alert limit and no premium jobs. Renew to get them back."].join("\n")
      : [`<b>Your ${name} ends on ${day(until)}</b>`, "", "Renew to keep every alert and premium job coming. The new time is added to what you have left."].join("\n"),
    buttons: [[{ text: `Renew ${name}`, path: "/app/plans" }]],
  };
}

/** Pictures for the main moments (the captions live with the bot copy). */
export const MOMENT_IMAGES = {
  welcome: "/og/msg/welcome",
  setup: "/og/msg/setup",
  allSet: "/og/msg/allset",
  plan: (plan: "pro" | "career", until: Date) => `/og/msg/plan?plan=${plan}&until=${until.toISOString().slice(0, 10)}`,
  job: (jobId: string) => `/j/${jobId}/share.jpg`,
};

/** The one reminder for people who never finished setup (sent with the setup picture). */
export function setupReminderText(firstName: string | null): string {
  const name = firstName ? `, ${firstName.replace(/[<>&]/g, "")}` : "";
  return [
    `<b>Your job alerts aren't set up yet${name}</b>`,
    "",
    "Tell me your profession and where you want to work, and I'll send you matching jobs the moment they're posted.",
    "",
    "It takes less than a minute.",
  ].join("\n");
}

