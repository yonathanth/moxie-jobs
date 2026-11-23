"use client";

import { RowsSkeleton } from "@/components/skeletons";
import { ChevronRight, FilePlus2, FileText, Gauge, Lock, Target, Upload, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PromoBanner } from "@/components/PromoBanner";
import type { CvQuotaDto, CvSummaryDto } from "@ethio/shared";
import { useCvList } from "@/components/cv/hooks";
import { postedAgo } from "@/components/jobs/JobCard";
import { Badge, Card, IconTile, PageHeader, Screen, type IconTone } from "@/components/ui";
import { formatBirr } from "@/lib/plans";

export default function CvsPage() {
  const list = useCvList();
  return (
    <Screen className="animate-fade-up">
      {list.data && <QuotaBanner quota={list.data.quota} />}
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
    </Screen>
  );
}

/** Soft card tints (as on the plan cards), per icon tone. */
const TINT: Partial<Record<IconTone, string>> = {
  accent: "border-accent-border/80 bg-[linear-gradient(135deg,#fff1e8_0%,#fff8f3_50%,#ffffff_100%)]",
  sky: "border-sky-200 bg-[linear-gradient(135deg,#e6f4fb_0%,#f3f9fd_50%,#ffffff_100%)]",
  violet: "border-violet-200/80 bg-[linear-gradient(135deg,#f3effd_0%,#faf8fe_50%,#ffffff_100%)]",
  emerald: "border-emerald-200/80 bg-[linear-gradient(135deg,#ebf8f2_0%,#f7fcf9_50%,#ffffff_100%)]",
};

function StartCard({ href, icon: Icon, tone, title, body }: { href: string; icon: LucideIcon; tone: IconTone; title: string; body: string }) {
  return (
    <Link href={href} className="group">
      <Card className={`h-full p-3.5 transition-transform group-active:scale-[0.99] ${TINT[tone] ?? ""}`}>
        <IconTile tone={tone}>
          <Icon className="size-5" />
        </IconTile>
        <p className="mt-3 text-[15px] font-semibold">{title}</p>
        <p className="text-[12px] text-hint">{body}</p>
      </Card>
    </Link>
  );
}

/** What's left (plan allowance, pack credits) or the cheapest pack, as a slim banner at the top. */
function QuotaBanner({ quota }: { quota: CvQuotaDto }) {
  const router = useRouter();
  if (quota.newLeft === null && quota.tailorLeft === null) return null; // unlimited: nothing to sell
  const n = (x: number | null) => (x === null ? "unlimited" : String(x));
  const included = quota.newLeft !== 0 || quota.tailorLeft !== 0;
  const credits = quota.credits.new + quota.credits.tailor > 0;
  const cheapest = quota.packs[0];
  const text = included
    ? `This month: ${n(quota.newLeft)} new · ${n(quota.tailorLeft)} tailored left`
    : credits
      ? `Credits: ${quota.credits.new} new · ${quota.credits.tailor} tailored`
      : quota.freeTailoringAvailable
        ? `First tailored CV free · packs from ${cheapest ? formatBirr(cheapest.price) : ""}`
        : `CV packs from ${cheapest ? formatBirr(cheapest.price) : ""} · credits never expire`;
  return (
    <PromoBanner
      id={`cv-quota-${included ? "plan" : credits ? "credits" : "packs"}`}
      icon={Gauge}
      action={included || credits ? "Get more" : "See packs"}
      onAction={() => router.push("/app/plans#packs")}
      className="sticky top-0 z-20 -mx-4 -mt-5 mb-5"
    >
      {text}
    </PromoBanner>
  );
}

function CvRow({ cv }: { cv: CvSummaryDto }) {
  return (
    <Link href={`/app/cvs/${cv.id}`} className="group">
      <Card className="flex items-center gap-3 p-3.5 transition-colors group-active:bg-neutral-50">
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
            Locked
          </Badge>
        ) : null}
        <ChevronRight className="size-4 text-hint-light" />
      </Card>
    </Link>
  );
}
