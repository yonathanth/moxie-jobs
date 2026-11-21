"use client";

import { RowsSkeleton } from "@/components/skeletons";
import { ChevronRight, FilePlus2, FileText, Lock, Target, Upload, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CvQuotaDto, CvSummaryDto } from "@ethio/shared";
import { BottomNav } from "@/components/BottomNav";
import { useCvList } from "@/components/cv/hooks";
import { postedAgo } from "@/components/jobs/JobCard";
import { Badge, Card, IconTile, PageHeader, Screen, type IconTone } from "@/components/ui";
import { formatBirr } from "@/lib/plans";

export default function CvsPage() {
  const list = useCvList();
  return (
    <Screen className="animate-fade-up">
      <PageHeader title="CVs" subtitle="Make a strong CV, then tailor it to each job in one tap." />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StartCard href="/app/cvs/new?mode=create" icon={FilePlus2} tone="accent" title="Create a CV" body="From a few answers" />
        <StartCard href="/app/cvs/new?mode=improve" icon={Upload} tone="sky" title="Improve my CV" body="Upload PDF, Word or a photo" />
      </div>

      {list.isPending ? (
        <div className="mt-3">
          <RowsSkeleton count={3} />
        </div>
      ) : list.isError ? (
        <p className="mt-6 px-1 text-sm text-danger">{list.error.message}</p>
      ) : (
        <>
          <QuotaCard quota={list.data.quota} />
          <section className="mt-5">
            <h2 className="mb-2 px-1 text-[15px] font-semibold">My CVs</h2>
            {list.data.items.length === 0 ? (
              <Card className="text-center">
                <p className="font-semibold">No CVs yet</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-hint">
                  Create one above, or tap &ldquo;Get a CV tailored to this job&rdquo; on any job and we&apos;ll make your first CV free.
                </p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {list.data.items.map((cv) => (
                  <CvRow key={cv.id} cv={cv} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <BottomNav />
    </Screen>
  );
}

function StartCard({ href, icon: Icon, tone, title, body }: { href: string; icon: LucideIcon; tone: IconTone; title: string; body: string }) {
  return (
    <Link href={href}>
      <Card className="h-full p-3.5 transition-colors active:bg-neutral-50">
        <IconTile tone={tone}>
          <Icon className="size-5" />
        </IconTile>
        <p className="mt-3 text-[15px] font-semibold">{title}</p>
        <p className="text-[12px] text-hint">{body}</p>
      </Card>
    </Link>
  );
}

function QuotaCard({ quota }: { quota: CvQuotaDto }) {
  const left = (n: number | null, one: string, many: string) => (n === null ? `Unlimited ${many}` : `${n} ${n === 1 ? one : many} left`);
  const included = quota.newLeft !== 0 || quota.tailorLeft !== 0;
  return (
    <Card className="mt-3 bg-pill/40 p-3.5">
      {included ? (
        <p className="text-[13px]">
          <span className="font-semibold">This month:</span> {left(quota.newLeft, "new CV", "new CVs")} · {left(quota.tailorLeft, "tailoring", "tailorings")}
        </p>
      ) : (
        <p className="text-[13px]">
          <span className="font-semibold">Pay per CV:</span> {formatBirr(quota.prices.cv_new)} for a new or improved CV, {formatBirr(quota.prices.cv_tailor)} per tailored CV. You see it
          first and pay only to download.
        </p>
      )}
      {quota.freeTailoringAvailable && <p className="mt-1 text-[13px] font-semibold text-accent-strong">Your first tailored CV is free.</p>}
    </Card>
  );
}

function CvRow({ cv }: { cv: CvSummaryDto }) {
  return (
    <Link href={`/app/cvs/${cv.id}`}>
      <Card className="flex items-center gap-3 p-3.5 transition-colors active:bg-neutral-50">
        <IconTile tone={cv.kind === "tailored" ? "violet" : "emerald"}>{cv.kind === "tailored" ? <Target className="size-5" /> : <FileText className="size-5" />}</IconTile>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{cv.title}</p>
          <p className="truncate text-[12px] text-hint">
            {cv.kind === "tailored" ? `Tailored${cv.jobTitle ? ` for ${cv.jobTitle}` : ""}` : cv.flow === "improve" ? "Improved CV" : "Base CV"} · {postedAgo(cv.updatedAt).toLowerCase()}
          </p>
        </div>
        {cv.locked ? (
          <Badge tone="accent">
            <Lock className="size-3" />
            {cv.unlockPrice ? formatBirr(cv.unlockPrice) : "Unpaid"}
          </Badge>
        ) : null}
        <ChevronRight className="size-4 text-hint-light" />
      </Card>
    </Link>
  );
}
