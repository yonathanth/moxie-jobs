"use client";

import clsx from "clsx";
import { ArrowRight, Briefcase, Check, Clock, ExternalLink, FileText, GraduationCap, Lock, MapPin, User, Wallet } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { TailorCvModal } from "@/components/cv/TailorCvModal";
import { useCvList } from "@/components/cv/hooks";
import { Suspense, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import type { JobCardDto } from "@ethio/shared";
import { SaveButton, ShareButton } from "@/components/jobs/JobActions";
import { daysLeft, postedAgo } from "@/components/jobs/JobCard";
import { useBackButton, useJob } from "@/components/miniapp/hooks";
import { usePaywall } from "@/components/paywall";
import { Badge, Button, Card, CenteredMessage, Dialog, IconTile, StickyFooter } from "@/components/ui";
import { useSession } from "@/components/miniapp/session";
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
  const [cvHighlight] = useState(wantsCv);

  // "Get a custom-made CV for this job": the same modal as on the CV tab. ?cv=1 (from the bot) opens it right away.
  const cvList = useCvList();
  const [tailoring, setTailoring] = useState(wantsCv);
  const tailor = () => {
    haptic.select();
    setTailoring(true);
  };
  const bases = (cvList.data?.items ?? []).filter((c) => c.kind === "base");

  const days = daysLeft(job.deadline);
  const closed = days !== null && days < 0;
  const sourceUrl = job.sourceUrl ?? job.apply?.url ?? null;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-36 pt-5 animate-fade-up">
      {tailoring && cvList.data && !job.locked && (
        <TailorCvModal job={job} bases={bases} freeTailoring={cvList.data.quota.freeTailoringAvailable} onClose={() => setTailoring(false)} />
      )}
      {!job.locked && !closed && (
        <div className="sticky top-0 z-20 -mx-4 -mt-5 mb-4 bg-bg/90 px-4 pb-3 pt-3 backdrop-blur">
          <button
            type="button"
            onClick={tailor}
            className={clsx(
              "flex w-full items-center gap-2.5 rounded-full bg-[linear-gradient(90deg,#ff7a1a_0%,#ff4f3a_100%)] py-2.5 pl-5 pr-2.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(255,79,58,0.7)] transition-transform active:scale-[0.98]",
              cvHighlight && "ring-4 ring-accent/25",
            )}
          >
            <FileText className="size-4 shrink-0" />
            <span className="flex-1 text-left">Get a custom-made CV for this job</span>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/25">
              <ArrowRight className="size-5" strokeWidth={2.5} />
            </span>
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-1">
        {job.employerLabel && <Badge tone={job.locked ? "accent" : "neutral"}>{job.employerLabel}</Badge>}
        {job.lockReason === "daily_limit" && <Badge>Opens tomorrow</Badge>}
        <span className="text-xs text-hint-light">Posted {postedAgo(job.firstSeenAt).toLowerCase()}</span>
      </div>
      <h1 className="mt-2 px-1 text-[24px] font-bold leading-tight tracking-tight">{job.title}</h1>
      {job.company && <p className="mt-1 px-1 text-[15px] text-hint">{job.company}</p>}
      <div className="mt-3 flex gap-2 px-1">
        <SaveButton job={job} variant="pill" />
        <ShareButton job={job} variant="pill" />
      </div>

      {job.lockReason === "daily_limit" ? (
        <HeldPanel onUpgrade={() => paywall.gate("daily_cap")} />
      ) : job.locked ? (
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
              Subscribe to see details
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

          <Requirements job={job} />

          <section className="mt-5">
            <h2 className="mb-2 px-1 text-[15px] font-semibold">How to apply</h2>
            <Card>
              <HowToApply job={job} />
            </Card>
          </section>

          {job.sourceTitle && <p className="mt-5 px-1 text-center text-xs text-hint">Found on {job.sourceTitle}</p>}
        </>
      )}

      {!job.locked && sourceUrl && (
        <StickyFooter>
          {closed && <p className="text-center text-[13px] text-hint">This job has closed.</p>}
          <Button
            variant={closed ? "secondary" : "primary"}
            onClick={() => {
              haptic.select();
              openExternal(sourceUrl);
            }}
          >
            {job.sourceTitle ? `View on ${job.sourceTitle}` : "View original post"}
            <ExternalLink className="size-4" />
          </Button>
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

/** The post's requirements; older jobs (extracted before requirements were kept) fall back to the facts we have. */
function Requirements({ job }: { job: JobCardDto }) {
  const items = job.requirements.length
    ? job.requirements
    : [
        job.education,
        job.experience ? `${job.experience} of experience` : null,
        job.skills.length ? `Skills: ${job.skills.join(", ")}` : null,
      ].filter((x): x is string => !!x);
  if (items.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-[15px] font-semibold">Requirements</h2>
      <Card>
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li key={r} className="flex items-start gap-2.5 text-[15px] leading-snug">
              <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-ink text-white">
                <Check className="size-2.5" strokeWidth={3.5} />
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** Instructions (email, phone, in person), plus the employer's application link when there is one. */
function HowToApply({ job }: { job: JobCardDto }) {
  const exact = job.apply?.label === "Apply" ? job.apply.url : null;
  const how =
    job.apply?.how ??
    (exact ? "Apply online on the employer's application page." : `Follow the instructions in the original post${job.sourceTitle ? ` on ${job.sourceTitle}` : ""}.`);
  return (
    <>
      <p className="text-[15px] leading-relaxed">{how}</p>
      {exact && (
        <button
          type="button"
          onClick={() => {
            haptic.select();
            openExternal(exact);
          }}
          className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-accent-strong"
        >
          Open application page
          <ExternalLink className="size-3.5" />
        </button>
      )}
    </>
  );
}

/**
 * A match over today's free alert limit: the details stay hidden until tomorrow (Addis Ababa), or now with Pro.
 * Opening it asks right away; the panel stays on the page after the prompt is closed.
 */
function HeldPanel({ onUpgrade }: { onUpgrade: () => void }) {
  const router = useRouter();
  const { me } = useSession();
  const [prompt, setPrompt] = useState(true);
  const cap = me.limits.dailyJobCap ?? 5;
  const body = `You've seen today's ${cap} free jobs. This one opens for free tomorrow, or subscribe to see the employer and how to apply now.`;
  const upgrade = () => {
    setPrompt(false);
    onUpgrade();
  };
  return (
    <>
      <Card className="mt-5 border-accent-border bg-[linear-gradient(120deg,var(--accent-soft)_0%,#ffffff_70%)]">
        <div className="flex items-start gap-3">
          <IconTile>
            <Clock className="size-5" />
          </IconTile>
          <div>
            <p className="text-[15px] font-semibold">Over today&apos;s free limit</p>
            <p className="mt-1 text-[13px] text-hint">{body}</p>
          </div>
        </div>
        <div className="mt-4">
          <Button variant="accent" onClick={upgrade}>
            Subscribe to see it now
          </Button>
        </div>
      </Card>
      {prompt && (
        <Dialog
          labelId="held-job-title"
          onClose={() => setPrompt(false)}
          icon={
            <IconTile>
              <Clock className="size-5" />
            </IconTile>
          }
          title="This job opens tomorrow"
          body={body}
        >
          <Button variant="accent" onClick={upgrade}>
            Subscribe to see it now
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setPrompt(false);
              router.push("/app/jobs?scope=for_you");
            }}
          >
            I&apos;ll see it tomorrow
          </Button>
        </Dialog>
      )}
    </>
  );
}
