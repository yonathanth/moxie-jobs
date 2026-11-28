import { CV_FAIR_USE_PER_MONTH, type CvContent, type CvProduct, type PlanLimits } from "@ethio/shared";

/** Pure CV rules: what a new CV costs, and text for the engine. Unit-tested. */

export type CvCharge = "free_base" | "taster" | "plan" | "credit" | "locked";

export interface ChargeInput {
  flow: "create" | "improve" | "tailor";
  /** create started from "tailor this job" by someone with no CV yet. */
  freeBase: boolean;
  /** Has used the one free tailoring everyone gets. */
  tasterUsed: boolean;
  limits: Pick<PlanLimits, "cvNewPerMonth" | "cvTailorPerMonth">;
  /** CVs made from the plan allowance in the last 30 days. */
  usedThisMonth: { new: number; tailor: number };
  /** CV pack credits left. */
  credits?: { new: number; tailor: number };
  unpaidCount: number;
  unpaidCap: number;
}

export type ChargeDecision = { charge: Exclude<CvCharge, "locked"> } | { charge: "locked"; product: CvProduct } | { blocked: "unpaid_cap" };

/** AI polish / AI check runs each pack-paid CV gets (paid plans are unmetered). */
export const PACK_AI_PER_CV = 5;

/**
 * Who gets AI on a CV: everyone on a paid plan (every CV, unmetered), and anyone on a CV
 * they paid for with a pack (credit or one-off purchase), capped per CV. Free and locked CVs: no.
 *   "plan" → unmetered · "pack" → counted against PACK_AI_PER_CV · null → not available
 */
export function aiAccess(paidPlan: boolean, charge: string): "plan" | "pack" | null {
  if (paidPlan) return "plan";
  return charge === "credit" || charge === "purchase" ? "pack" : null;
}

/** Remaining allowance: null = unlimited (fair use caps it silently). */
export function allowanceLeft(perMonth: number | null, used: number): number | null {
  if (perMonth === null) return used >= CV_FAIR_USE_PER_MONTH ? 0 : null;
  return Math.max(0, perMonth - used);
}

/**
 * Locked CVs (made while the plan didn't cover them) that the plan's monthly
 * allowance covers now, e.g. right after upgrading. Takes them in the order
 * given (newest first) and stops when that kind's allowance runs out.
 */
export function planUnlocks(
  locked: { id: string; product: string | null }[],
  limits: Pick<PlanLimits, "cvNewPerMonth" | "cvTailorPerMonth">,
  used: { new: number; tailor: number },
): string[] {
  const count = { ...used };
  const out: string[] = [];
  for (const cv of locked) {
    const tailor = cv.product === "cv_tailor";
    const left = tailor ? allowanceLeft(limits.cvTailorPerMonth, count.tailor) : allowanceLeft(limits.cvNewPerMonth, count.new);
    if (left !== null && left <= 0) continue;
    out.push(cv.id);
    if (tailor) count.tailor += 1;
    else count.new += 1;
  }
  return out;
}

/**
 * Order: the free base CV (started from a job, no CV yet) → the one free
 * tailoring → the plan's allowance → a CV pack credit → "make now, unlock later"
 * (locked), unless they already have the maximum number of unpaid CVs.
 */
export function decideCharge(c: ChargeInput): ChargeDecision {
  if (c.flow !== "tailor" && c.freeBase) return { charge: "free_base" };
  if (c.flow === "tailor" && !c.tasterUsed) return { charge: "taster" };
  const left = c.flow === "tailor" ? allowanceLeft(c.limits.cvTailorPerMonth, c.usedThisMonth.tailor) : allowanceLeft(c.limits.cvNewPerMonth, c.usedThisMonth.new);
  if (left === null || left > 0) return { charge: "plan" };
  if (((c.flow === "tailor" ? c.credits?.tailor : c.credits?.new) ?? 0) > 0) return { charge: "credit" };
  if (c.unpaidCount >= c.unpaidCap) return { blocked: "unpaid_cap" };
  return { charge: "locked", product: c.flow === "tailor" ? "cv_tailor" : "cv_new" };
}

/** A saved CV as plain text, as the engine's source for tailoring. */
export function cvAsText(c: CvContent): string {
  const lines: string[] = [];
  const p = c.personal ?? {};
  lines.push([p.full_name, p.title].filter(Boolean).join(" — "));
  lines.push([p.email, p.phone, p.location].filter(Boolean).join(" · "));
  for (const l of p.links ?? []) lines.push(`${l.label}: ${l.url}`);
  if (c.summary) lines.push("", "SUMMARY", c.summary);
  if (c.experience?.length) {
    lines.push("", "EXPERIENCE");
    for (const e of c.experience) {
      lines.push(`${e.role ?? ""} at ${e.company ?? ""}${e.location ? `, ${e.location}` : ""} (${e.start_date ?? "?"} – ${e.end_date ?? "?"})`);
      for (const b of e.bullets ?? []) lines.push(`- ${b}`);
    }
  }
  if (c.education?.length) {
    lines.push("", "EDUCATION");
    for (const e of c.education) lines.push([e.degree, e.field, e.institution, [e.start_date, e.end_date].filter(Boolean).join("–"), e.honors].filter(Boolean).join(", "));
  }
  if (c.skills?.length) lines.push("", "SKILLS", c.skills.join(", "));
  if (c.certifications?.length) lines.push("", "CERTIFICATIONS", ...c.certifications.map((x) => [x.name, x.issuer, x.date].filter(Boolean).join(", ")));
  if (c.projects?.length) lines.push("", "PROJECTS", ...c.projects.map((x) => `${x.name ?? ""}: ${x.description ?? ""}`));
  if (c.languages?.length) lines.push("", "LANGUAGES", ...c.languages.map((x) => [x.language, x.proficiency].filter(Boolean).join(" — ")));
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

/** The job post for tailoring: the original post (+ fetched page) when we have it, else our summary. */
export function jobDescriptionFor(job: { title: string; company: string | null; summary: string }, original: string | null): string {
  const head = `${job.title}${job.company ? ` at ${job.company}` : ""}`;
  return (original && original.length > 120 ? `${head}\n\n${original}` : `${head}\n\n${job.summary}`).slice(0, 18_000);
}

/** "Accountant — Abebe Kebede" / "Senior Accountant at Oromia Bank". */
export function cvTitle(kind: "base" | "tailored", content: CvContent, job?: { title: string; company: string | null }): string {
  if (kind === "tailored" && job) return `${job.title}${job.company ? ` at ${job.company}` : ""}`.slice(0, 120);
  const p = content.personal ?? {};
  return ([p.title, p.full_name].filter(Boolean).join(" — ") || "My CV").slice(0, 120);
}

/**
 * GoMoxie's polish returns its normalized shape (bullets as {label?, text},
 * skills also as skillGroups). Our CVs keep bullets as strings and one skills
 * list, which is what our editor edits.
 */
export function toPlainContent(c: Record<string, unknown>): CvContent {
  const out = { ...c } as CvContent & { skillGroups?: { items?: string[] }[] };
  const bullet = (b: unknown): string =>
    typeof b === "string" ? b : b && typeof b === "object" ? [(b as { label?: string }).label, (b as { text?: string }).text].filter(Boolean).join(": ") : "";
  if (Array.isArray(out.experience)) out.experience = out.experience.map((e) => ({ ...e, bullets: (e.bullets ?? []).map(bullet).filter(Boolean) }));
  if (Array.isArray(out.projects)) out.projects = out.projects.map((p) => ({ ...p, ...("bullets" in p ? { bullets: ((p as { bullets?: unknown[] }).bullets ?? []).map(bullet).filter(Boolean) } : {}) }));
  if (Array.isArray(out.skillGroups)) {
    const grouped = out.skillGroups.flatMap((g) => g.items ?? []).filter((s) => typeof s === "string" && s.trim());
    if (grouped.length) out.skills = [...new Set(grouped)];
    delete out.skillGroups;
  }
  return out;
}
