"use client";

import clsx from "clsx";
import { Briefcase, Clock, ExternalLink, FileText, GraduationCap, Lock, MapPin, User, Wallet } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import type { JobCardDto } from "@ethio/shared";
import { daysLeft, postedAgo } from "@/components/jobs/JobCard";
import { useBackButton, useJob } from "@/components/miniapp/hooks";
import { usePaywall } from "@/components/paywall";
import { Badge, Button, Card, CenteredMessage, IconTile, StickyFooter } from "@/components/ui";
import { formatDate } from "@/lib/plans";
import { haptic, openExternal } from "@/lib/telegram";

export default function JobPage() {
  return (
    <Suspense
      fallback={
        <ScreenSkeleton variant="detail" />
      }
    >
      <JobDetail />
    </Suspense>
  );
}

function JobDetail() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const wantsCv = useSearchParams().get("cv") === "1";
  const job = useJob(id);
  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/app/jobs"));
  useBackButton(goBack);

  if (job.isPending) {
    return (
      <ScreenSkeleton variant="detail" />
    );
  }
  if (job.isError) {
    return (
      <CenteredMessage title="Job not found" body="It may have closed or been removed.">
        <Button onClick={() => router.push("/app/jobs")}>Browse jobs</Button>
      </CenteredMessage>
    );
  }
  return <JobView job={job.data} wantsCv={wantsCv} />;
}

function JobView({ job, wantsCv }: { job: JobCardDto; wantsCv: boolean }) {
  const paywall = usePaywall();
  const cvRef = useRef<HTMLDivElement>(null);
  const [cvHighlight] = useState(wantsCv);

  useEffect(() => {
    if (wantsCv) cvRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [wantsCv]);

  const router = useRouter();
  const tailor = () => {
    haptic.select();
    router.push(`/app/cvs/new?mode=tailor&jobId=${job.id}`);
  };

  const days = daysLeft(job.deadline);
  const closed = days !== null && days < 0;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-36 pt-5 animate-fade-up">
      <div className="flex flex-wrap items-center gap-2 px-1">
        {job.employerLabel && <Badge tone={job.locked ? "accent" : "neutral"}>{job.employerLabel}</Badge>}
        {job.match === "waiting" && <Badge>Over today&apos;s alert limit</Badge>}
        <span className="text-xs text-hint-light">Posted {postedAgo(job.firstSeenAt).toLowerCase()}</span>
      </div>
      <h1 className="mt-2 px-1 text-[24px] font-bold leading-tight tracking-tight">{job.title}</h1>
      {job.company && <p className="mt-1 px-1 text-[15px] text-hint">{job.company}</p>}

      {job.locked ? (
        <Card className="mt-5 border-accent-border bg-[linear-gradient(120deg,var(--accent-soft)_0%,#ffffff_70%)]">
          <div className="flex items-start gap-3">
            <IconTile>
              <Lock className="size-5" />
            </IconTile>
            <div>
              <p className="text-[15px] font-semibold">This job comes with Pro</p>
              <p className="mt-1 text-[13px] text-hint">
                NGO, UN, AU, embassy, international company and overseas jobs, with the employer, requirements and how to apply.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Button variant="accent" onClick={() => paywall.gate("premium_job")}>
              Unlock with Pro
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="mt-5">
            <dl className="flex flex-col divide-y divide-separator-subtle">
              <Fact icon={MapPin} label="Location" value={job.location} />
              <Fact icon={Briefcase} label="Experience" value={job.experience} />
              <Fact icon={GraduationCap} label="Education" value={job.education} />
              <Fact icon={FileText} label="Job type" value={job.jobType ?? "Full-time"} />
              <Fact icon={Wallet} label="Salary" value={job.salary} />
              <Fact
                icon={Clock}
                label="Deadline"
                value={job.deadline ? `${formatDate(job.deadline)}${days !== null ? ` · ${days <= 0 ? "closes today" : `${days} days left`}` : ""}` : null}
                urgent={days !== null && days <= 3}
              />
              <Fact icon={User} label="Gender" value={job.gender} hideWhenEmpty />
            </dl>
            {job.notStated.length > 0 && (
              <p className="mt-3 border-t border-separator-subtle pt-3 text-[12px] text-hint">
                The post doesn&apos;t state the {job.notStated.join(", ")}. We still matched it in case it fits.
              </p>
            )}
          </Card>

          <section className="mt-5">
            <h2 className="mb-2 px-1 text-[15px] font-semibold">About the role</h2>
            <Card>
              <p className="text-[15px] leading-relaxed">{job.summary}</p>
              {job.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.skills.map((s) => (
                    <span key={s} className="rounded-full bg-pill px-2.5 py-1 text-[12px] font-medium text-hint">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </section>

          {job.apply?.how && (
            <section className="mt-5">
              <h2 className="mb-2 px-1 text-[15px] font-semibold">How to apply</h2>
              <Card>
                <p className="text-[15px]">{job.apply.how}</p>
              </Card>
            </section>
          )}

          <div ref={cvRef} className="mt-5 scroll-mt-24">
            <Card className={clsx("transition-shadow", cvHighlight && "ring-2 ring-accent/40")}>
              <div className="flex items-start gap-3">
                <IconTile tone="violet">
                  <FileText className="size-5" />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">A CV tailored to this job</p>
                  <p className="mt-1 text-[13px] text-hint">
                    We rewrite your CV around this post&apos;s requirements, using only what&apos;s true. No CV yet? We make your first one free.
                  </p>
                </div>
              </div>
              <Button variant="secondary" className="mt-3" onClick={tailor}>
                Tailor my CV for this job
              </Button>
            </Card>
          </div>

          {job.sourceTitle && <p className="mt-5 px-1 text-center text-xs text-hint">Found on {job.sourceTitle}</p>}
        </>
      )}

      {!job.locked && (
        <StickyFooter>
          {closed ? (
            <p className="py-2 text-center text-sm text-hint">This job has closed.</p>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" className="w-auto flex-1" onClick={tailor}>
                <FileText className="size-4" />
                Tailored CV
              </Button>
              {job.apply?.url && (
                // "Apply" = exact application link; "View job" = the original post.
                <Button
                  className="w-auto flex-[2]"
                  onClick={() => {
                    haptic.select();
                    openExternal(job.apply!.url!);
                  }}
                >
                  {job.apply.label}
                  <ExternalLink className="size-4" />
                </Button>
              )}
            </div>
          )}
        </StickyFooter>
      )}
    </main>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  urgent,
  hideWhenEmpty,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | null;
  urgent?: boolean;
  hideWhenEmpty?: boolean;
}) {
  if (!value && hideWhenEmpty) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-hint-light" />
      <dt className="w-24 shrink-0 text-[13px] text-hint">{label}</dt>
      <dd className={clsx("min-w-0 flex-1 text-[14px] font-medium", !value && "font-normal text-hint-light", urgent && "text-accent-strong")}>
        {value ?? "Not stated"}
      </dd>
    </div>
  );
}
