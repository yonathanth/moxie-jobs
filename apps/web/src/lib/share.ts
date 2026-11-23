import type { JobCardDto } from "@ethio/shared";
import { APP_NAME } from "./config";
import { getWebApp } from "./telegram";

/** Public link for a job: a preview page with a rich card in chats, then the bot. */
export function jobShareUrl(jobId: string): string {
  return `${window.location.origin}/j/${jobId}`;
}

/** The message that goes with the link: what the job is, then why to open it. */
export function jobShareText(job: Pick<JobCardDto, "title" | "company" | "employerLabel" | "location" | "deadline">): string {
  const who = job.company ?? job.employerLabel;
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
export async function shareJob(job: Pick<JobCardDto, "id" | "title" | "company" | "employerLabel" | "location" | "deadline">): Promise<"shared" | "copied" | "failed"> {
  const url = jobShareUrl(job.id);
  const text = jobShareText(job);
  const wa = getWebApp();
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
