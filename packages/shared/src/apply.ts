/** Where a job's Apply button leads (used by the bot card and the click-tracking redirect). */

export interface ApplyFields {
  applyMethod: string;
  applyUrl: string | null;
  applyEmail: string | null;
  applyTelegram: string | null;
  sourceUrl: string;
}

export interface ApplyTarget {
  /** URL the button opens. */
  url: string;
  /** Button label. */
  label: string;
}

export function applyTarget(job: ApplyFields): ApplyTarget {
  if (job.applyMethod === "url" && job.applyUrl) return { url: job.applyUrl, label: "Apply" };
  if (job.applyMethod === "telegram" && job.applyTelegram) {
    return { url: `https://t.me/${job.applyTelegram.replace(/^@/, "")}`, label: "Apply" };
  }
  // No exact application link (email, phone, in person, or only via the job board): the original post has the details.
  return { url: job.sourceUrl, label: "View job" };
}
