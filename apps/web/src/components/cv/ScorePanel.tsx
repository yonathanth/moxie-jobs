"use client";

import { ArrowRight, Briefcase, Check, Crown, Lightbulb, Loader2, Lock, Plus, Wand, Wand2 } from "lucide-react";
import Link from "next/link";
import type { CvReviewTip } from "@ethio/shared";
import { JOB_WEIGHT, QUALITY_WEIGHT, overallGain, scoreTone, type CvScore, type PolishTarget, type ScoreCheck } from "@/lib/cv-score";
import { cx, Sheet } from "../ui";
import { usePaywall } from "../paywall";
import { EDITOR_SECTION_LIST, sectionStatus, type SectionKey } from "./editor/CvEditor";
import type { CvContent } from "@ethio/shared";

/**
 * GoMoxie's CV score (resume: create-flow/CvScorePanel.tsx), for a phone:
 * a ring that opens a sheet with what's missing (everyone), the job match,
 * and on paid plans the full breakdown with AI polish and AI check.
 */

const TARGET_SCORE = 75;
const LOCKED_PREVIEW = 3;
const fmtGain = (n: number) => (n >= 1 ? `+${Math.round(n)}` : "+<1");
const polishKey = (t: PolishTarget) => (t.kind === "bullets" && t.index !== undefined ? `bullets:${t.index}` : t.kind);

export function ScoreRing({ score, size }: { score: number; size: number }) {
  const stroke = size > 40 ? 5 : 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone = scoreTone(score);
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e5e5" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className={cx("absolute font-bold tabular-nums", tone.text, size > 40 ? "text-lg" : "text-[13px]")}>{score}</span>
    </span>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="w-24 shrink-0 font-medium text-neutral-700">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${score}%`, background: scoreTone(score).ring }} />
      </span>
      <span className="w-14 text-right font-semibold tabular-nums text-neutral-700">{score}/100</span>
    </div>
  );
}

/** The ring + "CV score / See why" button that opens the sheet. */
export function ScoreBadge({ score, onOpen }: { score: CvScore; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-neutral-300 bg-white py-1 pl-1 pr-3 transition-colors hover:border-neutral-400 active:bg-neutral-50">
      <ScoreRing score={score.total} size={36} />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-medium text-hint">CV score</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-accent-strong underline decoration-accent-border decoration-2 underline-offset-4">
          See why <ArrowRight className="size-3.5" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

/** Compact score for the editor's sticky bar: always in view, never in the way. */
export function ScoreChip({ score, onOpen }: { score: CvScore; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`CV score ${score.total}. See why`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-separator bg-surface py-1 pl-1 pr-2.5 transition-colors hover:border-neutral-300 active:bg-neutral-50"
    >
      <ScoreRing score={score.total} size={32} />
      <span className="flex flex-col items-start leading-none">
        <span className="text-[10px] font-medium uppercase tracking-wide text-hint">Score</span>
        <span className="mt-0.5 inline-flex items-center gap-0.5 text-[12px] font-semibold text-accent-strong">
          Why <ArrowRight className="size-3" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

export interface ScoreSheetProps {
  score: CvScore;
  content: CvContent;
  /** Paid plan: full breakdown, AI polish, AI check. */
  canPolish: boolean;
  /** Requirements the tailoring found the person may not meet. */
  gaps: string[];
  isTailored: boolean;
  onClose: () => void;
  onGoTo: (target: { section: string; index?: number; field?: string }) => void;
  onPolish: (targets: PolishTarget[] | "all", key: string) => void;
  polishingKey: string | null;
  onReview: () => void;
  reviewing: boolean;
  tips: CvReviewTip[] | null;
}

export function ScoreSheet(props: ScoreSheetProps) {
  const { score, canPolish, polishingKey } = props;
  const paywall = usePaywall();
  const tone = scoreTone(score.total);
  const failing = score.checks.filter((c) => c.status !== "pass");
  const byGain = (a: ScoreCheck, b: ScoreCheck) => overallGain(score, b) - overallGain(score, a);
  const missing = failing.filter((c) => c.kind === "missing").sort(byGain);
  const improve = failing.filter((c) => c.kind === "improve").sort(byGain);
  const missingGain = missing.reduce((s, c) => s + overallGain(score, c), 0);
  const improveGain = improve.reduce((s, c) => s + overallGain(score, c), 0);
  const aiFixable = improve.filter((c) => c.fix === "ai" && c.polish);
  const busy = polishingKey !== null;
  const hasJob = score.job !== undefined;

  const goTo = (c: { section: string; index?: number; field?: string }) => {
    props.onGoTo(c);
    props.onClose();
  };

  const polishButton = (targets: PolishTarget[] | "all", key: string, label: string) => {
    const spinning = polishingKey === key;
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => props.onPolish(targets, key)}
        className="inline-flex items-center gap-1 rounded-md border border-accent-border px-2 py-1 text-xs font-semibold text-accent-strong transition-colors hover:bg-accent-soft disabled:opacity-50"
      >
        {spinning ? <Loader2 className="size-3.5 animate-spin" /> : <Wand className="size-3.5" />}
        {spinning ? "Polishing…" : label}
      </button>
    );
  };

  const checkItem = (check: ScoreCheck, withPolish: boolean) => (
    <li key={check.id} className="rounded-lg border border-neutral-200 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{check.label}</span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-emerald-700">{fmtGain(overallGain(score, check))}</span>
      </div>
      <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-600">{check.message}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => goTo({ section: check.section, index: check.index, field: check.field })}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Go to <ArrowRight className="size-3" />
        </button>
        {withPolish && check.fix === "ai" && check.polish && polishButton([check.polish], polishKey(check.polish), "Polish")}
      </div>
    </li>
  );

  const lockedIds = new Set(canPolish ? [] : improve.slice(0, LOCKED_PREVIEW).map((c) => c.id));
  const shownChecks = canPolish ? missing : [...missing, ...improve.filter((c) => lockedIds.has(c.id))].sort(byGain);

  const lockedItem = (check: ScoreCheck) => (
    <li key={check.id}>
      <button type="button" onClick={() => paywall.gate("cv_ai")} className="block w-full rounded-lg border border-accent-border bg-accent-soft/60 p-2.5 text-left">
        <span className="flex items-baseline justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Lock className="size-3.5 shrink-0 text-accent-strong" aria-hidden="true" />
            {score.categories.find((c) => c.key === check.category)?.label ?? "Your CV"} tip
          </span>
          <span className="shrink-0 text-xs font-bold tabular-nums text-emerald-700">{fmtGain(overallGain(score, check))}</span>
        </span>
        <span aria-hidden="true" className="mt-1.5 block space-y-1">
          <span className="block h-2 w-11/12 rounded-full bg-accent-border/60" />
          <span className="block h-2 w-2/3 rounded-full bg-accent-border/60" />
        </span>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-strong">
          <Crown className="size-3" /> Subscribe to unlock
        </span>
      </button>
    </li>
  );

  return (
    <Sheet title="CV score" onClose={props.onClose}>
      <div className="-mx-5">
        {/* Overall */}
        <div className="space-y-3 border-b border-neutral-200 px-5 pb-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={score.total} size={64} />
            <div className="min-w-0 flex-1">
              <div className={cx("text-base font-bold", tone.text)}>{tone.label}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-hint">
                {score.depthCap ? (
                  <>
                    Held at <strong className="text-neutral-700">{score.depthCap.max}</strong> because your CV is short (about {score.depthCap.words} words). More detail in your roles lifts it; aim for{" "}
                    {score.depthCap.target}+.
                  </>
                ) : score.total >= TARGET_SCORE ? (
                  <>Above the {TARGET_SCORE} we recommend.</>
                ) : (
                  <>
                    Aim for <strong className="text-neutral-700">{TARGET_SCORE}+</strong>.{missing.length > 0 && <> Adding what&apos;s missing below gets you {fmtGain(missingGain)}.</>}
                  </>
                )}
              </p>
            </div>
          </div>
          {hasJob && (
            <div className="space-y-1.5">
              <ScoreBar label="CV quality" score={score.quality} />
              <ScoreBar label="Job match" score={score.job!} />
              <p className="text-[11px] text-hint">
                Overall for {score.jobMatch?.title || "this job"} = {Math.round(QUALITY_WEIGHT * 100)}% CV quality + {Math.round(JOB_WEIGHT * 100)}% job match.
              </p>
            </div>
          )}
        </div>

        {/* Sections */}
        <div className="border-b border-neutral-200 px-5 py-3">
          <div className="mb-2 text-sm font-semibold">Your sections</div>
          <div className="flex flex-wrap gap-1.5">
            {EDITOR_SECTION_LIST.map((s) => {
              const state = sectionStatus(props.content, s.key as SectionKey);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => goTo({ section: s.key })}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    state === "done"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : state === "partial"
                        ? "border border-amber-200 bg-amber-50 text-amber-800"
                        : "border border-dashed border-neutral-300 text-hint",
                  )}
                >
                  {state === "done" ? <Check className="size-3" /> : state === "partial" ? <span className="size-1.5 rounded-full bg-amber-500" /> : <Plus className="size-3" />}
                  {s.title}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-hint">Languages and certificates never lower your score. Add them if you have them.</p>
        </div>

        {/* What's missing */}
        <div className="space-y-2 border-b border-neutral-200 px-5 py-3">
          <div className="text-sm font-semibold">{shownChecks.length ? "Add these for a better score" : "Nothing missing"}</div>
          {shownChecks.length === 0 && <p className="text-xs text-hint">Every detail is there.</p>}
          <ul className="space-y-1.5">{shownChecks.map((check) => (lockedIds.has(check.id) ? lockedItem(check) : checkItem(check, canPolish)))}</ul>
        </div>

        {/* Job match */}
        <div className="space-y-2 border-b border-neutral-200 px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Briefcase className="size-3.5 text-hint" />
            Job match
          </span>
          {!props.isTailored ? (
            <p className="text-xs leading-relaxed text-hint">
              Tailor this CV to a job to see how well it matches, and which skills the job asks for that you haven&apos;t listed.{" "}
              <Link href="/app/jobs" className="font-semibold text-accent-strong">
                Find a job
              </Link>
            </p>
          ) : (
            <>
              {score.jobMatch &&
                [
                  { label: "Required", skills: score.jobMatch.required },
                  { label: "Nice to have", skills: score.jobMatch.preferred },
                ]
                  .filter((g) => g.skills.length > 0)
                  .map((g) => (
                    <div key={g.label}>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-hint-light">{g.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {g.skills.map((s) => (
                          <span
                            key={s.skill}
                            className={cx(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              s.found ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-neutral-300 bg-white text-hint",
                            )}
                          >
                            {s.found ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-neutral-300" />}
                            {s.skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              {props.gaps.length > 0 && (
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-hint-light">The job also asks for</div>
                  <ul className="space-y-1">
                    {props.gaps.map((g) => (
                      <li key={g} className="flex gap-2 text-xs leading-relaxed text-neutral-700">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
                        {g}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-hint">Only add these if you really have them.</p>
                </div>
              )}
              {!score.jobMatch && props.gaps.length === 0 && <p className="text-xs text-hint">Your CV covers what this job asks for.</p>}
            </>
          )}
        </div>

        {canPolish ? (
          <>
            <div className="space-y-2 border-b border-neutral-200 px-5 py-3">
              <div className="text-sm font-semibold">Score breakdown</div>
              {score.categories.map((c) => (
                <ScoreBar key={c.key} label={c.label} score={c.max ? Math.round((c.score / c.max) * 100) : 0} />
              ))}
            </div>
            <div className="space-y-2 px-5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{improve.length ? "Improve what's there" : "Nothing to improve"}</span>
                {aiFixable.length > 0 && polishButton("all", "all", "Polish all")}
              </div>
              {improve.length === 0 && <p className="text-xs text-hint">Every check passes. Nice work.</p>}
              <ul className="space-y-1.5">{improve.map((check) => checkItem(check, true))}</ul>
            </div>
            <div className="space-y-2 border-t border-neutral-200 bg-neutral-50/60 px-5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Lightbulb className="size-3.5 text-hint" /> AI check
                </span>
                <button
                  type="button"
                  onClick={props.onReview}
                  disabled={props.reviewing}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                >
                  {props.reviewing ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  {props.reviewing ? "Reviewing…" : props.tips ? "Check again" : "Get tips"}
                </button>
              </div>
              {!props.tips && <p className="text-xs text-hint">A recruiter-style read of your CV. Tips don&apos;t change the score.</p>}
              {props.tips?.length === 0 && <p className="text-xs text-hint">No further tips. It reads well.</p>}
              {props.tips && props.tips.length > 0 && (
                <ul className="space-y-1.5">
                  {props.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-neutral-700">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-neutral-400" />
                      <span>{tip.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          improve.length > 0 && (
            <div className="px-5 py-3">
              <button
                type="button" onClick={() => paywall.gate("cv_ai")}
                className="group block w-full rounded-xl border border-accent-border bg-linear-to-br from-accent-soft to-white p-3.5 text-left shadow-sm"
              >
                <span className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
                    <Crown className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold">{improve.length > LOCKED_PREVIEW ? `Unlock all ${improve.length} ways to improve` : `Unlock ${improve.length === 1 ? "this fix" : "these fixes"}`}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">{fmtGain(improveGain)} pts</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-neutral-600">See the full breakdown, get an AI check, and let AI polish your CV in one tap.</span>
                  </span>
                </span>
                <span className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-hint">With Pro and Career</span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                    Unlock {fmtGain(improveGain)} <ArrowRight className="size-3.5" />
                  </span>
                </span>
              </button>
            </div>
          )
        )}
      </div>
    </Sheet>
  );
}
