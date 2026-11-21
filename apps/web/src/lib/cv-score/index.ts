import type { CvContent, CvJobRequirements } from "@ethio/shared";
import { scoreCv, type CvScore, type ScoreInput } from "./engine";

export * from "./engine";

/**
 * engine.ts is a verbatim copy of GoMoxie's score engine (resume/src/lib/cv-score/engine.ts,
 * itself shared with resume-back), so a CV scores the same here as on gomoxie.app.
 * Don't edit it here: copy it over again when GoMoxie changes it.
 */

/** Sections our editor shows (only these are checked for half-filled entries). */
export const EDITOR_SECTIONS = ["personal", "summary", "experience", "education", "skills", "languages", "certifications", "projects"];

export function scoreContent(content: CvContent, job: CvJobRequirements | null): CvScore {
  return scoreCv(content as ScoreInput, job ? { seniority: "", keywords: [], ...job } : null, { sections: EDITOR_SECTIONS });
}

/** Color band for a score: red under 60, amber to 84, green from 85 (as on GoMoxie). */
export function scoreTone(score: number): { ring: string; text: string; bg: string; label: string } {
  if (score >= 85) return { ring: "#059669", text: "text-emerald-700", bg: "bg-emerald-50", label: "Strong" };
  if (score >= 60) return { ring: "#d97706", text: "text-amber-700", bg: "bg-amber-50", label: "Good start" };
  return { ring: "#dc2626", text: "text-red-700", bg: "bg-red-50", label: "Needs work" };
}
