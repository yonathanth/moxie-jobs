"use client";

import clsx from "clsx";
import { Building2, ChevronRight, Clock, Lock, MapPin } from "lucide-react";
import Link from "next/link";
import type { JobCardDto } from "@ethio/shared";
import { usePaywall } from "../paywall";
import { CategoryIcon } from "../categoryIcons";
import { Badge, Skeleton } from "../ui";
import { SaveButton, ShareButton } from "./JobActions";

/** Days until a deadline (Addis Ababa), or null. */
export function daysLeft(deadline: string | null, now = Date.now()): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - now) / (24 * 3_600_000));
}

export function postedAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function DeadlinePill({ deadline }: { deadline: string | null }) {
  const days = daysLeft(deadline);
  if (days === null) return null;
  const closed = days < 0;
  const urgent = !closed && days <= 3;
  return (
    <span className={clsx("inline-flex items-center gap-1 text-[12px] font-medium", urgent ? "text-accent-strong" : "text-hint")}>
      <Clock className="size-3" />
      {closed ? "Closed" : days === 0 ? "Closes today" : days === 1 ? "1 day left" : `${days} days left`}
    </span>
  );
}

const DAY_MS = 24 * 3_600_000;

/**
 * One job in a list. The top opens the job (locked premium jobs open the paywall);
 * the footer holds Save, Share and an explicit "See details".
 */
export function JobCard({ job, from }: { job: JobCardDto; from?: string }) {
  const paywall = usePaywall();
  const href = `/app/jobs/${job.id}${from ? `?from=${encodeURIComponent(from)}` : ""}`;
  // Kinds of jobs the plan lacks open the paywall; matches over today's limit open their page (which explains).
  const premiumLock = job.lockReason === "premium" || (job.locked && job.lockReason == null);
  const held = job.lockReason === "daily_limit";
  const fresh = !job.locked && Date.now() - new Date(job.firstSeenAt).getTime() < DAY_MS;

  const top = (
    <div className="p-4 pb-3">
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "grid size-10 shrink-0 place-items-center rounded-xl border",
            premiumLock ? "border-accent-border bg-surface text-accent-strong" : held ? "border-separator bg-neutral-50 text-hint" : "border-separator bg-neutral-50 text-accent-strong/80",
          )}
        >
          {premiumLock ? <Lock className="size-[18px]" /> : held ? <Clock className="size-[18px]" /> : <CategoryIcon id={job.functionId ?? "other"} className="size-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 text-[15px] font-semibold leading-snug">{job.title}</h3>
            {premiumLock ? (
              <Badge tone="accent">
                <Lock className="size-3" />
                Pro
              </Badge>
            ) : held || job.match === "waiting" ? (
              <Badge tone="neutral">Opens tomorrow</Badge>
            ) : fresh ? (
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
                <span className="size-1.5 rounded-full bg-accent" />
                New
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] text-hint">
            {held ? (
              <span className="truncate">Over today&apos;s free limit: opens tomorrow, or subscribe</span>
            ) : premiumLock ? (
              <>
                <Building2 className="size-3.5 shrink-0" />
                <span className="truncate">{job.employerLabel ?? "NGO or international employer"}: subscribe to see details</span>
              </>
            ) : (
              <span className="truncate">{[job.company, job.employerLabel].filter(Boolean).join(" · ") || "Employer not stated"}</span>
            )}
          </p>
        </div>
      </div>
      {!job.locked && job.summary && <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-text/80">{job.summary}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {job.location && (
          <span className="inline-flex items-center gap-1 text-[12px] text-hint">
            <MapPin className="size-3" />
            {job.location}
          </span>
        )}
        <DeadlinePill deadline={job.deadline} />
        <span className="ml-auto text-[12px] text-hint-light">{postedAgo(job.firstSeenAt)}</span>
      </div>
    </div>
  );

  return (
    <article
      className={clsx(
        "overflow-hidden rounded-2xl border bg-surface shadow-[0_10px_28px_-24px_rgba(15,17,21,0.35)]",
        premiumLock ? "border-accent-border bg-[linear-gradient(120deg,var(--accent-soft)_0%,#ffffff_70%)]" : "border-separator",
      )}
    >
      {premiumLock ? (
        <button type="button" className="block w-full text-left transition-colors active:bg-accent-soft/60" onClick={() => paywall.gate("premium_job", { then: href })}>
          {top}
        </button>
      ) : (
        <Link href={href} className="block transition-colors active:bg-neutral-50">
          {top}
        </Link>
      )}
      <div className="flex items-center gap-0.5 border-t border-separator-subtle px-2 py-1.5">
        <SaveButton job={job} />
        <ShareButton job={job} />
        {premiumLock ? (
          <button
            type="button"
            onClick={() => paywall.gate("premium_job", { then: href })}
            className="ml-auto inline-flex h-9 items-center gap-0.5 rounded-lg px-2.5 text-[13px] font-semibold text-accent-strong hover:bg-accent-soft"
          >
            Subscribe to see details
            <ChevronRight className="size-4" />
          </button>
        ) : (
          <Link
            href={href}
            className="ml-auto inline-flex h-9 items-center gap-0.5 rounded-lg px-2.5 text-[13px] font-semibold text-accent-strong hover:bg-accent-soft"
          >
            See details
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
    </article>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-separator bg-surface">
      <div className="p-4 pb-3">
        <div className="flex gap-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-2/5" />
          </div>
        </div>
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-1.5 h-3 w-4/5" />
      </div>
      <div className="flex gap-2 border-t border-separator-subtle px-4 py-3">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="ml-auto h-4 w-20" />
      </div>
    </div>
  );
}
