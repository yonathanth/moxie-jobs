import type { JobCardDto } from "@ethio/shared";
import { APP_NAME, miniAppJobLink } from "./config";
import { api } from "./api";
import { getWebApp } from "./telegram";

/** Shared link: opens the job straight in the Mini App (Telegram's startapp link). */
export function jobShareUrl(jobId: string): string {
  return miniAppJobLink(jobId);
}

type ShareableJob = Pick<JobCardDto, "id" | "title" | "company" | "employerLabel" | "premium" | "location" | "deadline">;

/** The message that goes with the link: what the job is, then why to open it. */
export function jobShareText(job: Omit<ShareableJob, "id">): string {
  // Premium jobs (NGO, UN, embassy, abroad) never name the employer outside the app: that's what Pro pays for.
  const who = job.premium ? job.employerLabel : (job.company ?? job.employerLabel);
  const lines = [`${job.title}${who ? ` at ${who}` : ""}`];
  const meta = [job.location, job.deadline ? `apply by ${new Date(job.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : null].filter(Boolean);
  if (meta.length) lines.push(meta.join(" · "));
  lines.push(`Thought of you when I saw this. Get jobs like it on ${APP_NAME}, free on Telegram.`);
  return lines.join("\n");
}

/**
 * Shares a job. In Telegram: the chat picker (t.me/share). Elsewhere: the system share sheet,
 * else the link is copied. Returns "copied" when the caller should say so.
 */
export async function shareJob(job: ShareableJob, token?: string): Promise<"shared" | "copied" | "failed"> {
  const url = jobShareUrl(job.id);
  const text = jobShareText(job);
  const wa = getWebApp();
  // Telegram 8.0+: a photo message (job card, caption, "View job" button) sent to the chat they pick.
  if (wa?.shareMessage && wa.isVersionAtLeast?.("8.0") && token) {
    try {
      const { id } = await api.prepareJobShare(token, job.id);
      wa.shareMessage(id);
      return "shared";
    } catch {
      // Falls through to the plain link (e.g. the bot couldn't prepare it).
    }
  }
  if (wa) {
    wa.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    return "shared";
  }
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: job.title, text, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "shared"; // they closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
