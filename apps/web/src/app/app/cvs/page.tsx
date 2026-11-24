"use client";

import { RowsSkeleton } from "@/components/skeletons";
import { ArrowRight, ChevronRight, FilePlus2, FileText, Gauge, Lock, Target, Upload, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NewCvModal } from "@/components/cv/NewCvModal";
import { haptic } from "@/lib/telegram";
import type { CvQuotaDto, CvSummaryDto } from "@ethio/shared";
import { useCvList } from "@/components/cv/hooks";
import { postedAgo } from "@/components/jobs/JobCard";
import { Badge, Card, IconTile, PageHeader, Screen, type IconTone } from "@/components/ui";

export default function CvsPage() {
  const list = useCvList();
  const router = useRouter();
  const [flow, setFlow] = useState<"create" | "improve" | null>(null);
  // A share link (?new=create|improve) opens the matching flow once the list (its quota) is in.
  useEffect(() => {
    if (!list.data) return;
    const want = new URLSearchParams(window.location.search).get("new");
    if (want === "create" || want === "improve") {
      setFlow(want);
      router.replace("/app/cvs");
    }
  }, [list.data, router]);
  // The modal needs the quota (what it costs); before the list loads, the page version works the same.
  const start = (f: "create" | "improve") => {
    haptic.select();
    if (list.data) setFlow(f);
    else router.push(`/app/cvs/new?mode=${f}`);
  };
  return (
    <Screen className="animate-fade-up">
      {flow && list.data && <NewCvModal flow={flow} quota={list.data.quota} cvs={list.data.items} onClose={() => setFlow(null)} />}
      <PageHeader title="CVs" subtitle="Make a strong CV, then tailor it to each job in one tap." />
      {list.data && <QuotaLine quota={list.data.quota} />}

      <div className="mt-5 flex flex-col gap-3">
        <StartCard onClick={() => start("create")} icon={FilePlus2} tone="accent" title="Create a CV" body="From a few answers" />
        <StartCard onClick={() => start("improve")} icon={Upload} tone="sky" title="Improve my CV" body="Upload PDF, Word or a photo" />
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

function StartCard({ onClick, icon: Icon, tone, title, body }: { onClick: () => void; icon: LucideIcon; tone: IconTone; title: string; body: string }) {
  return (
    <button type="button" onClick={onClick} className="group w-full text-left">
      <Card
        className={`flex items-center gap-3.5 p-4 shadow-[0_12px_28px_-14px_rgba(15,17,21,0.35)] transition-[transform,box-shadow] group-active:scale-[0.99] group-active:shadow-[0_6px_16px_-10px_rgba(15,17,21,0.3)] ${TINT[tone] ?? ""}`}
      >
        <IconTile tone={tone}>
          <Icon className="size-5" />
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">{title}</span>
          <span className="block text-[13px] text-hint">{body}</span>
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-text shadow-[0_2px_6px_-2px_rgba(15,17,21,0.2)]">
          <ArrowRight className="size-4" />
        </span>
      </Card>
    </button>
  );
}

/** What's left this month or in pack credits, as a quiet line (nothing when unlimited or nothing left). */
function QuotaLine({ quota }: { quota: CvQuotaDto }) {
  if (quota.newLeft === null && quota.tailorLeft === null) return null;
  const n = (x: number | null) => (x === null ? "unlimited" : String(x));
  const included = quota.newLeft !== 0 || quota.tailorLeft !== 0;
  const credits = quota.credits.new + quota.credits.tailor > 0;
  const text = included
    ? `This month: ${n(quota.newLeft)} new · ${n(quota.tailorLeft)} tailored left`
    : credits
      ? `Credits: ${quota.credits.new} new · ${quota.credits.tailor} tailored`
      : quota.freeTailoringAvailable
        ? "Your first tailored CV is free"
        : null;
  if (!text) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 px-1 text-[13px] text-hint">
      <Gauge className="size-3.5" />
      {text}
    </p>
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
