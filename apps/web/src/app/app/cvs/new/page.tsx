"use client";

import clsx from "clsx";
import { Briefcase, Check, CheckCircle2, ChevronRight, Compass, FilePlus2, FileText, Loader2, type LucideIcon, RefreshCw, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import type { CvGenerateRequest, CvQuotaDto, CvSummaryDto, JobCardDto } from "@ethio/shared";
import { useCvList, useGenerateCv, useImportCv } from "@/components/cv/hooks";
import { useBackButton, useJob } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { Button, Card, CenteredMessage, ErrorText, IconTile, PageHeader, Screen, StickyFooter, type IconTone } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatBirr } from "@/lib/plans";
import { haptic } from "@/lib/telegram";

type Mode = "create" | "improve" | "tailor";

export default function NewCvPage() {
  return (
    <Suspense
      fallback={
        <ScreenSkeleton variant="form" />
      }
    >
      <NewCv />
    </Suspense>
  );
}

function NewCv() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = (["create", "improve", "tailor"].includes(params.get("mode") ?? "") ? params.get("mode") : "create") as Mode;
  const jobId = params.get("jobId");
  // "Make a new CV for this job" from the mismatch screen: skip the CV picker.
  const fresh = params.get("fresh") === "1";
  const list = useCvList();
  const job = useJob(jobId ?? "", mode === "tailor" && !!jobId);
  const generate = useGenerateCv();
  const [mismatch, setMismatch] = useState<MismatchState | null>(null);
  const [phase, setPhase] = useState<"base" | "tailor" | null>(null);
  useBackButton(() => router.back());

  const bases = useMemo(() => (list.data?.items ?? []).filter((c) => c.kind === "base"), [list.data]);
  const quota = list.data?.quota;

  if (list.isPending || (mode === "tailor" && jobId && job.isPending)) {
    return (
      <ScreenSkeleton variant="form" />
    );
  }
  if (generate.isPending) return <Working phase={phase ?? (mode === "tailor" ? "tailor" : "base")} jobTitle={job.data?.title} />;

  const open = (id: string) => router.replace(`/app/cvs/${id}`);

  /** Generates; for "tailor with no CV yet", makes the free base CV first, then tailors it. */
  const run = async (req: CvGenerateRequest, thenTailor: boolean) => {
    setMismatch(null);
    try {
      setPhase(thenTailor ? "base" : req.flow === "tailor" ? "tailor" : "base");
      const res = await generate.mutateAsync(req);
      if (res.status === "mismatch") {
        haptic.error();
        return setMismatch({ reason: res.reason, missing: res.missing });
      }
      if (!thenTailor || !jobId) {
        haptic.success();
        return open(res.cv.id);
      }
      setPhase("tailor");
      const tailored = await generate.mutateAsync({ flow: "tailor", jobId, baseCvId: res.cv.id });
      if (tailored.status === "mismatch") {
        haptic.error();
        setMismatch({ reason: tailored.reason, missing: tailored.missing, newCvId: res.cv.id });
        return;
      }
      haptic.success();
      open(tailored.cv.id);
    } catch {
      haptic.error();
    }
  };

  if (mismatch && jobId) {
    return (
      <MismatchScreen
        m={mismatch}
        job={job.data ?? null}
        jobId={jobId}
        otherCvs={bases.length > 1 && !mismatch.newCvId}
        freeTailoring={!!quota?.freeTailoringAvailable}
        onTryAnother={() => setMismatch(null)}
      />
    );
  }

  const error = generate.error instanceof ApiError ? generate.error.message : generate.error ? "Something went wrong. Please try again." : null;

  // Tailoring and they already have a CV: pick which one to tailor.
  if (mode === "tailor" && jobId && bases.length > 0 && !fresh) {
    return (
      <TailorPick
        job={job.data ?? null}
        bases={bases}
        quota={quota!}
        error={error}
        onTailor={(baseCvId) => void run({ flow: "tailor", jobId, baseCvId }, false)}
      />
    );
  }

  // Create / improve, or tailor with no CV yet (base CV first, free).
  const fromJob = mode === "tailor" && !!jobId;
  return (
    <SourceForm
      mode={mode === "improve" ? "improve" : "create"}
      allowSwitch={fromJob}
      fromJob={fromJob ? (job.data ?? null) : null}
      quota={quota!}
      error={error}
      onSubmit={(req) => void run({ ...req, ...(fromJob ? { forJobId: jobId! } : {}) }, fromJob)}
    />
  );
}

/* ---------- pick a base CV to tailor ---------- */

function TailorPick({
  job,
  bases,
  quota,
  error,
  onTailor,
}: {
  job: JobCardDto | null;
  bases: CvSummaryDto[];
  quota: CvQuotaDto;
  error: string | null;
  onTailor: (baseCvId: string) => void;
}) {
  const [chosen, setChosen] = useState(bases[0]!.id);
  return (
    <Screen className="animate-fade-up">
      <PageHeader eyebrow="Tailor your CV" title={job?.title ?? "This job"} subtitle={job?.company ?? undefined} />
      <section className="mt-5">
        <h2 className="mb-2 px-1 text-[15px] font-semibold">Which CV should we tailor?</h2>
        <div className="flex flex-col gap-2">
          {bases.map((cv) => (
            <button
              key={cv.id}
              type="button"
              onClick={() => setChosen(cv.id)}
              aria-pressed={chosen === cv.id}
              className={clsx(
                "flex w-full items-center gap-3 rounded-2xl border bg-surface p-3.5 text-left transition-colors",
                chosen === cv.id ? "border-ink ring-1 ring-ink" : "border-separator",
              )}
            >
              <IconTile tone="emerald" size="sm">
                <FileText />
              </IconTile>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{cv.title}</span>
              {chosen === cv.id && <Check className="size-4 text-ink" />}
            </button>
          ))}
        </div>
      </section>
      <p className="mt-4 px-1 text-[13px] text-hint">
        We rewrite it around this job&apos;s requirements, using only what&apos;s true in your CV, and point out anything the job asks for that you don&apos;t show yet.
      </p>
      <StickyFooter>
        {error && <ErrorText>{error}</ErrorText>}
        <PriceNote flow="tailor" quota={quota} />
        <Button variant="accent" onClick={() => onTailor(chosen)}>
          Tailor my CV
        </Button>
      </StickyFooter>
    </Screen>
  );
}

/* ---------- create / improve ---------- */

const PROMPT = `For example:
• Your current or last job: title, company, years, what you did and achieved
• Earlier jobs
• Education: degree, field, university, year
• Skills, software and languages
• Certificates or training`;

function SourceForm({
  mode: initialMode,
  allowSwitch,
  fromJob,
  quota,
  error,
  onSubmit,
}: {
  mode: "create" | "improve";
  allowSwitch: boolean;
  fromJob: JobCardDto | null;
  quota: CvQuotaDto;
  error: string | null;
  onSubmit: (req: CvGenerateRequest) => void;
}) {
  const { me } = useSession();
  const importCv = useImportCv();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState([me.firstName, me.lastName].filter(Boolean).join(" ") === "Dev" ? "" : [me.firstName, me.lastName].filter(Boolean).join(" "));
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [focus, setFocus] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => setMode(initialMode), [initialMode]);

  const ready = name.trim().length >= 2 && text.trim().length >= 40;
  const pick = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    importCv.mutate(file, { onSuccess: (r) => setText(r.text), onError: () => haptic.error() });
  };

  return (
    <Screen className="animate-fade-up">
      {fromJob ? (
        <>
          <PageHeader eyebrow="Tailor your CV" title={fromJob.title} subtitle="First, your CV. It's free. Then we tailor it to this job." />
        </>
      ) : (
        <PageHeader title={mode === "improve" ? "Improve my CV" : "Create a CV"} subtitle={mode === "improve" ? "Upload your current CV and we'll rewrite it to stand out." : "Answer a few questions; we write a professional CV."} />
      )}

      {allowSwitch && (
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-separator bg-surface p-1">
          {(["create", "improve"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={clsx("rounded-lg py-2 text-sm font-semibold", mode === m ? "bg-ink text-white" : "text-hint")}>
              {m === "create" ? "Write it" : "Upload my CV"}
            </button>
          ))}
        </div>
      )}

      <Card className="mt-5">
        <div className="grid gap-3">
          <Field label="Full name" value={name} onChange={setName} placeholder="e.g. Abebe Kebede" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" type="email" />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="+251 9…" type="tel" />
          </div>
        </div>
      </Card>

      {mode === "improve" && (
        <Card className="mt-3">
          <input ref={fileInput} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full items-center gap-3 text-left">
            <IconTile tone="sky">{importCv.isPending ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}</IconTile>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{fileName ?? "Upload your CV"}</span>
              <span className="block text-[12px] text-hint">{importCv.isPending ? "Reading it…" : "PDF, Word (.docx) or a clear photo"}</span>
            </span>
          </button>
          {importCv.error && (
            <div className="mt-2">
              <ErrorText>{importCv.error.message}</ErrorText>
            </div>
          )}
        </Card>
      )}

      <section className="mt-3">
        <h2 className="mb-2 px-1 text-[15px] font-semibold">{mode === "improve" ? "Your CV's text" : "About your experience"}</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={mode === "improve" ? 10 : 9}
          placeholder={mode === "improve" ? "Upload your CV above, or paste its text here." : PROMPT}
          className="w-full rounded-2xl border border-separator bg-surface p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-hint-light focus:border-ink"
        />
        <p className="mt-1 px-1 text-[12px] text-hint">Plain words are fine, in English or Amharic. We only use what you tell us. Nothing is made up.</p>
      </section>

      {mode === "improve" && (
        <div className="mt-3">
          <Field label="Anything to focus on? (optional)" value={focus} onChange={setFocus} placeholder="e.g. aim for a senior role, highlight leadership" />
        </div>
      )}


      <StickyFooter>
        {error && <ErrorText>{error}</ErrorText>}
        <PriceNote flow={mode} quota={quota} freeBase={!!fromJob} />
        <Button
          variant="accent"
          disabled={!ready || importCv.isPending}
          onClick={() => onSubmit({ flow: mode, sourceText: text, name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, focus: focus.trim() || undefined })}
        >
          {fromJob ? "Make my CV and tailor it" : mode === "improve" ? "Improve my CV" : "Create my CV"}
        </Button>
      </StickyFooter>
    </Screen>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block text-[12px] font-medium text-hint">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-xl border border-separator bg-surface px-3.5 text-[15px] text-text outline-none placeholder:text-hint-light focus:border-ink"
      />
    </label>
  );
}

/** What this will cost, from the plan allowance and prices. */
function PriceNote({ flow, quota, freeBase }: { flow: Mode; quota: CvQuotaDto; freeBase?: boolean }) {
  let note: string;
  if (freeBase) note = quota.freeTailoringAvailable ? "Free: your CV and your first tailored CV" : `Your CV is free. The tailored CV: ${quota.tailorLeft !== 0 ? "included in your plan" : `free to make, ${formatBirr(quota.prices.cv_tailor)} to download`}`;
  else if (flow === "tailor") note = quota.freeTailoringAvailable ? "Free: your first tailored CV" : quota.tailorLeft !== 0 ? "Included in your plan" : `Free to make · ${formatBirr(quota.prices.cv_tailor)} to download`;
  else note = quota.newLeft !== 0 ? "Included in your plan" : `Free to make · ${formatBirr(quota.prices.cv_new)} to download`;
  return <p className="text-center text-[12px] text-hint">{note}</p>;
}

type MismatchState = { reason: string; missing: string[]; newCvId?: string };

/**
 * The engine won't tailor a CV to a job in another field (it would have to
 * invent experience). Say so plainly and offer real ways forward.
 */
function MismatchScreen({
  m,
  job,
  jobId,
  otherCvs,
  freeTailoring,
  onTryAnother,
}: {
  m: MismatchState;
  job: JobCardDto | null;
  jobId: string;
  otherCvs: boolean;
  freeTailoring: boolean;
  onTryAnother: () => void;
}) {
  const router = useRouter();
  return (
    <Screen className="animate-fade-up pb-56">
      <div className="flex flex-col items-center pt-6 text-center">
        <IconTile tone="neutral">
          <Compass className="size-5" />
        </IconTile>
        <h1 className="mt-4 text-[22px] font-bold leading-tight tracking-tight">This job needs a different background</h1>
        {job && (
          <p className="mt-1 text-[14px] text-hint">
            {job.title}
            {job.company ? ` · ${job.company}` : ""}
          </p>
        )}
      </div>

      <Card className="mt-6">
        <p className="text-[15px] leading-relaxed">{m.reason}</p>
        {m.missing.length > 0 && (
          <>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-hint-light">The job asks for</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {m.missing.map((x) => (
                <span key={x} className="rounded-full border border-separator bg-pill/60 px-2.5 py-1 text-[12px] font-medium text-text">
                  {x}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-emerald-soft px-3.5 py-3 text-[13px] text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald" />
        <span>
          Nothing was charged{freeTailoring ? ", and your free tailored CV is still yours to use" : ""}.
          {m.newCvId ? " Your new CV is saved, ready for jobs in your field." : ""} We don&apos;t add experience you don&apos;t have, because employers check.
        </span>
      </div>

      <h2 className="mb-2 mt-6 px-1 text-[15px] font-semibold">What you can do</h2>
      <div className="flex flex-col gap-2">
        <NextStep
          icon={Briefcase}
          tone="sky"
          title="See jobs that fit my CV"
          body="Your feed, matched to your field and experience"
          onClick={() => router.push("/app/jobs")}
        />
        {m.newCvId && (
          <NextStep icon={FileText} tone="emerald" title="Open my new CV" body="Check it, edit it, or send it as a PDF" onClick={() => router.replace(`/app/cvs/${m.newCvId}`)} />
        )}
        {otherCvs && <NextStep icon={RefreshCw} tone="violet" title="Try one of my other CVs" body="Pick a CV closer to this job" onClick={onTryAnother} />}
        {!m.newCvId && (
          <NextStep
            icon={FilePlus2}
            tone="accent"
            title="I do have this experience"
            body="Write a new CV that shows it, then we tailor it"
            onClick={() => router.replace(`/app/cvs/new?mode=tailor&jobId=${jobId}&fresh=1`)}
          />
        )}
      </div>

      <StickyFooter>
        <Button variant="secondary" onClick={() => router.push(`/app/jobs/${jobId}`)}>
          Back to the job
        </Button>
      </StickyFooter>
    </Screen>
  );
}

function NextStep({ icon: Icon, tone, title, body, onClick }: { icon: LucideIcon; tone: IconTone; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic.select();
        onClick();
      }}
      className="flex w-full items-center gap-3 rounded-2xl border border-separator bg-surface p-3.5 text-left transition-colors active:bg-neutral-50"
    >
      <IconTile tone={tone}>
        <Icon className="size-5" />
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block text-[13px] text-hint">{body}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-hint-light" />
    </button>
  );
}

function Working({ phase, jobTitle }: { phase: "base" | "tailor"; jobTitle?: string }) {
  return (
    <CenteredMessage
      icon={
        <IconTile>
          <Loader2 className="size-5 animate-spin" />
        </IconTile>
      }
      title={phase === "tailor" ? "Tailoring your CV…" : "Writing your CV…"}
      body={phase === "tailor" ? `Matching it to ${jobTitle ?? "the job"}. This takes about 15 seconds.` : "Turning your answers into a professional CV. This takes about 15 seconds."}
    />
  );
}
