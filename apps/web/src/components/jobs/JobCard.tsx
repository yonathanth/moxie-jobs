"use client";

import clsx from "clsx";
import { Building2, Clock, Lock, MapPin } from "lucide-react";
import Link from "next/link";
import type { JobCardDto } from "@ethio/shared";
import { usePaywall } from "../paywall";
import { Badge } from "../ui";

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
  const urgent = days <= 3;
  return (
    <span className={clsx("inline-flex items-center gap-1 text-[12px] font-medium", urgent ? "text-accent-strong" : "text-hint")}>
      <Clock className="size-3" />
      {days <= 0 ? "Closes today" : days === 1 ? "1 day left" : `${days} days left`}
    </span>
  );
}

/** One row of the feed. Locked (premium) jobs open the paywall instead of the job. */
export function JobCard({ job, from }: { job: JobCardDto; from?: string }) {
  const paywall = usePaywall();
  const body = (
    <article
      className={clsx(
        "rounded-2xl border bg-surface p-4 transition-colors",
        job.locked ? "border-accent-border bg-[linear-gradient(120deg,var(--accent-soft)_0%,#ffffff_70%)]" : "border-separator active:bg-neutral-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[15px] font-semibold leading-snug">{job.title}</h3>
        {job.locked ? (
          <Badge tone="accent">
            <Lock className="size-3" />
            Pro
          </Badge>
        ) : job.match === "waiting" ? (
          <Badge tone="neutral">Over today&apos;s limit</Badge>
        ) : null}
      </div>
      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] text-hint">
        {job.locked ? (
          <>
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">{job.employerLabel ?? "Premium employer"}: details with Pro</span>
          </>
        ) : (
          <span className="truncate">{[job.company, job.employerLabel].filter(Boolean).join(" · ") || "Employer not stated"}</span>
        )}
      </p>
      {!job.locked && job.summary && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-text/80">{job.summary}</p>}
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
    </article>
  );

  if (job.locked) {
    return (
      <button type="button" className="block w-full text-left" onClick={() => paywall.gate("premium_job")}>
        {body}
      </button>
    );
  }
  return (
    <Link href={`/app/jobs/${job.id}${from ? `?from=${encodeURIComponent(from)}` : ""}`} className="block">
      {body}
    </Link>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-2xl border border-separator bg-surface p-4">
      <div className="h-4 w-3/5 animate-pulse rounded bg-pill" />
      <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-pill" />
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-pill" />
      <div className="mt-1.5 h-3 w-4/5 animate-pulse rounded bg-pill" />
    </div>
  );
}
