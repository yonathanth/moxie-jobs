"use client";

import clsx from "clsx";
import { Briefcase, Check, CheckCircle2, ChevronRight, ClipboardPaste, Compass, FilePlus2, FileText, Loader2, type LucideIcon, RefreshCw, Upload, UserRound, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ScreenSkeleton } from "@/components/skeletons";
import type { CvGenerateRequest, CvQuotaDto, CvSummaryDto, JobCardDto } from "@ethio/shared";
import { ContactForm, Field } from "@/components/cv/ContactForm";
import { PackCards } from "@/components/cv/PackCards";
import { useCvList, useGenerateCv, useImportCv, usePackCheckout } from "@/components/cv/hooks";
import { useBackButton, useJob, usePayment, usePricing } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { usePaywall } from "@/components/paywall";
import { Button, Card, CenteredMessage, ErrorText, IconTile, PageHeader, Screen, Sheet, Skeleton, StickyFooter, type IconTone } from "@/components/ui";
import { MoxieLoader } from "@/components/moxie";
import { ApiError } from "@/lib/api";
import { formatBirr } from "@/lib/plans";
import { getWebApp, haptic } from "@/lib/telegram";

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
  // Out of free/included CVs: the request waits here while they buy a pack, then runs again.
  const [blocked, setBlocked] = useState<{ req: CvGenerateRequest; thenTailor: boolean; message: string } | null>(null);
  const [payment, setPayment] = useState<{ id: string; url: string } | null>(null);
  useBackButton(() => router.back());

  const bases = useMemo(() => (list.data?.items ?? []).filter((c) => c.kind === "base"), [list.data]);
  const quota = list.data?.quota;

  if (list.isPending || (mode === "tailor" && jobId && job.isPending)) {
    return (
      <ScreenSkeleton variant="form" />
    );
  }
  if (generate.isPending) return <Working phase={phase ?? (mode === "tailor" ? "tailor" : "base")} flow={mode} jobTitle={job.data?.title} />;

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
    } catch (err) {
      haptic.error();
      // 402: no allowance or credits left and the unpaid limit is reached. Offer packs, keep the request.
      if (err instanceof ApiError && err.status === 402) setBlocked({ req, thenTailor, message: err.message });
    }
  };

  if (payment && blocked) {
    return (
      <PackWaiting
        payment={payment}
        onPaid={() => {
          const retry = blocked;
          setPayment(null);
          setBlocked(null);
          void run(retry.req, retry.thenTailor);
        }}
        onCancel={() => setPayment(null)}
      />
    );
  }

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

  const error =
    generate.error instanceof ApiError
      ? generate.error.status === 402
        ? null
        : generate.error.message
      : generate.error
        ? "Something went wrong. Please try again."
        : null;
  const packSheet = blocked && !payment && (
    <PackPrompt
      message={blocked.message}
      onClose={() => setBlocked(null)}
      onCheckout={(p) => {
        setPayment(p);
        openCheckout(p.url);
      }}
    />
  );

  // Tailoring and they already have a CV: pick which one to tailor.
  if (mode === "tailor" && jobId && bases.length > 0 && !fresh) {
    return (
      <>
      {packSheet}
      <TailorPick
        job={job.data ?? null}
        bases={bases}
        quota={quota!}
        error={error}
        onTailor={(baseCvId) => void run({ flow: "tailor", jobId, baseCvId }, false)}
      />
      </>
    );
  }

  // Create / improve, or tailor with no CV yet (base CV first, free).
  const fromJob = mode === "tailor" && !!jobId;
  return (
    <>
    {packSheet}
    <SourceForm
      mode={mode === "improve" ? "improve" : "create"}
      allowSwitch={fromJob}
      fromJob={fromJob ? (job.data ?? null) : null}
      quota={quota!}
      error={error}
      onSubmit={(req) => void run({ ...req, ...(fromJob ? { forJobId: jobId! } : {}) }, fromJob)}
    />
    </>
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
  // Personal details are asked once (first CV), then reused and edited in Profile → CV details.
  const [step, setStep] = useState<"details" | "content">(me.cvContact ? "content" : "details");
  const [firstTime] = useState(!me.cvContact);
  const [savedNote, setSavedNote] = useState(false);
  // Improve: upload a file (goes straight on to improving it) or paste the text.
  const [source, setSource] = useState<"upload" | "paste" | null>(null);
  const [text, setText] = useState("");
  const [focus, setFocus] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => setMode(initialMode), [initialMode]);

  const submit = (flow: "create" | "improve", sourceText: string) => {
    const contact = me.cvContact;
    if (!contact) return;
    onSubmit({
      flow,
      sourceText,
      name: contact.name,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      location: contact.location ?? undefined,
      focus: focus.trim() || undefined,
    });
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    importCv.mutate(file, {
      onSuccess: (r) => {
        if (r.text.trim().length >= 40) submit("improve", r.text);
        else {
          // Too little text came out (e.g. a blurry photo): let them paste it instead.
          haptic.error();
          setText(r.text);
          setSource("paste");
        }
      },
      onError: () => haptic.error(),
    });
  };
  const showText = mode === "create" || source === "paste";

  const header = fromJob ? (
    <PageHeader eyebrow="Tailor your CV" title={fromJob.title} subtitle={step === "details" ? "First, your CV. It's free. Then we tailor it to this job." : undefined} />
  ) : (
    <PageHeader
      title={mode === "improve" ? "Improve my CV" : "Create a CV"}
      subtitle={step === "details" ? undefined : mode === "improve" ? "Upload your current CV and we'll rewrite it to stand out." : "Tell us about your experience; we write a professional CV."}
    />
  );

  if (step === "details") {
    return (
      <Screen className="animate-fade-up">
        {header}
        <StepDots current={1} total={2} label="Your details" />
        <Card className="mt-4 p-5">
          <div className="mb-5 flex items-center gap-3">
            <IconTile tone="accent" size="sm">
              <UserRound />
            </IconTile>
            <div>
              <p className="text-[15px] font-semibold">Your details</p>
              <p className="text-[13px] text-hint">At the top of every CV. You fill this in once.</p>
            </div>
          </div>
          <ContactForm
            sticky
            submitLabel="Continue"
            onSaved={() => {
              haptic.success();
              setSavedNote(true);
              setStep("content");
              window.scrollTo({ top: 0 });
            }}
          />
        </Card>
      </Screen>
    );
  }

  const contact = me.cvContact;
  const ready = !!contact && text.trim().length >= 40;

  return (
    <Screen className="animate-fade-up">
      {header}
      {firstTime && <StepDots current={2} total={2} label={mode === "improve" ? "Your current CV" : "Your experience"} />}

      {savedNote ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-900 animate-[fade-in_0.2s_ease-out]">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <span className="flex-1">
            Details saved. You can change them anytime in <span className="font-semibold">Profile → CV details</span>.
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => setSavedNote(false)} className="-mr-1 -mt-0.5 grid size-6 place-items-center rounded-full text-emerald-700/70">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {allowSwitch && (
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-separator bg-surface p-1">
          {(["create", "improve"] as const).map((m) => (
            <button key={m} type="button" onClick={() => {
                setMode(m);
                setSource(null);
              }} className={clsx("rounded-lg py-2 text-sm font-semibold", mode === m ? "bg-ink text-white" : "text-hint")}>
              {m === "create" ? "Write it" : "Upload my CV"}
            </button>
          ))}
        </div>
      )}

      {mode === "improve" && !showText && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="mb-2 mt-5 px-1 text-[15px] font-semibold">How do you want to add your CV?</p>
          <div className="flex flex-col gap-3">
            <ChoiceCard
              icon={Upload}
              tone="sky"
              title="Upload a file"
              body="PDF, Word (.docx) or a clear photo. We improve it right away."
              onClick={() => {
                haptic.select();
                setSource("upload");
                fileInput.current?.click();
              }}
            />
            <ChoiceCard
              icon={ClipboardPaste}
              tone="violet"
              title="Paste the text"
              body="Copy your CV's text and paste it in."
              onClick={() => {
                haptic.select();
                setSource("paste");
              }}
            />
          </div>
          {importCv.error && (
            <div className="mt-3">
              <ErrorText>{importCv.error.message}</ErrorText>
            </div>
          )}
          <div className="mt-4">
            <PriceNote flow={mode} quota={quota} freeBase={!!fromJob} />
          </div>
          {error && (
            <div className="mt-2">
              <ErrorText>{error}</ErrorText>
            </div>
          )}
        </>
      )}

      {showText && (
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[15px] font-semibold">{mode === "improve" ? "Your CV's text" : "About your experience"}</h2>
            {mode === "improve" && (
              <button type="button" onClick={() => setSource(null)} className="text-[13px] font-semibold text-accent-strong">
                Upload instead
              </button>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={mode === "improve" ? 10 : 9}
            placeholder={mode === "improve" ? "Paste your CV's text here." : PROMPT}
            className="w-full rounded-2xl border border-separator bg-surface p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-hint-light focus:border-ink"
          />
          <p className="mt-1 px-1 text-[12px] text-hint">Plain words are fine, in English or Amharic. We only use what you tell us. Nothing is made up.</p>
        </section>
      )}

      {mode === "improve" && showText && (
        <div className="mt-3">
          <Field label="Anything to focus on? (optional)" value={focus} onChange={setFocus} placeholder="e.g. aim for a senior role, highlight leadership" />
        </div>
      )}

      {importCv.isPending && (
        <MoxieLoader
          animation="read"
          crowned={me.plan !== "free"}
          messages={[fileName ? `Reading ${fileName}…` : "Reading your CV…", "Finding your jobs and dates…", "Picking out your skills…"]}
        />
      )}

      {showText && (
      <StickyFooter>
        {error && <ErrorText>{error}</ErrorText>}
        <PriceNote flow={mode} quota={quota} freeBase={!!fromJob} />
        <Button variant="accent" disabled={!ready || importCv.isPending} onClick={() => submit(mode, text)}>
          {fromJob ? "Make my CV and tailor it" : mode === "improve" ? "Improve my CV" : "Create my CV"}
        </Button>
      </StickyFooter>
      )}

    </Screen>
  );
}

/** "Step 1 of 2 · Your details" with two small bars. */
function StepDots({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div className="mt-5 px-1">
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={clsx("h-1 flex-1 rounded-full transition-colors", i < current ? "bg-ink" : "bg-separator")} />
        ))}
      </div>
      <p className="mt-2 text-[12px] font-medium text-hint">
        Step {current} of {total} · <span className="text-text">{label}</span>
      </p>
    </div>
  );
}

/** What this will cost, from the plan allowance and prices. */
/** What this will cost: plan allowance → pack credit → free to make, unlocked with a pack. */
function PriceNote({ flow, quota, freeBase }: { flow: Mode; quota: CvQuotaDto; freeBase?: boolean }) {
  const from = quota.packs[0] ? `CV packs from ${formatBirr(quota.packs[0].price)}` : "a CV pack";
  const tailorCost = quota.tailorLeft !== 0 ? "included in your plan" : quota.credits.tailor > 0 ? "uses 1 credit" : `free to make, unlock with ${from}`;
  const newCost = quota.newLeft !== 0 ? "Included in your plan" : quota.credits.new > 0 ? `Uses 1 of your ${quota.credits.new} credits` : `Free to make · unlock with ${from}`;
  let note: string;
  if (freeBase) note = quota.freeTailoringAvailable ? "Free: your CV and your first tailored CV" : `Your CV is free. The tailored CV: ${tailorCost}`;
  else if (flow === "tailor") note = quota.freeTailoringAvailable ? "Free: your first tailored CV" : tailorCost.charAt(0).toUpperCase() + tailorCost.slice(1);
  else note = newCost;
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

/** Moxie at work while the AI writes, improves or tailors the CV (as on gomoxie.app). */
function Working({ phase, flow, jobTitle }: { phase: "base" | "tailor"; flow: Mode; jobTitle?: string }) {
  const { me } = useSession();
  const crowned = me.plan !== "free";
  if (phase === "tailor") {
    return (
      <MoxieLoader
        animation="tailor"
        crowned={crowned}
        messages={[jobTitle ? `Tailoring your CV to ${jobTitle}…` : "Reading the job post…", "Matching your experience to it…", "Cutting what doesn't fit…", "Keeping it all true to you…"]}
      />
    );
  }
  if (flow === "improve") {
    return <MoxieLoader animation="polish" crowned={crowned} messages={["Improving your CV…", "Tightening every bullet…", "Bringing your results forward…", "Cutting the filler…"]} />;
  }
  return <MoxieLoader animation="write" crowned={crowned} messages={["Writing your CV…", "Choosing strong action verbs…", "Turning duties into results…", "Laying it out cleanly…"]} />;
}

/** A big tappable option with an icon and a chevron. */
function ChoiceCard({ icon: Icon, tone, title, body, onClick }: { icon: LucideIcon; tone: IconTone; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-separator bg-surface p-4 text-left shadow-[0_10px_28px_-16px_rgba(15,17,21,0.3)] transition-transform active:scale-[0.99]"
    >
      <IconTile tone={tone}>
        <Icon className="size-5" />
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block text-[12px] text-hint">{body}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-hint" />
    </button>
  );
}

function openCheckout(url: string) {
  const wa = getWebApp();
  if (wa) wa.openLink(url);
  else window.open(url, "_blank", "noopener");
}

/** Out of CVs: pick a pack. After paying, the CV they were making is made straight away. */
function PackPrompt({ message, onClose, onCheckout }: { message: string; onClose: () => void; onCheckout: (p: { id: string; url: string }) => void }) {
  const paywall = usePaywall();
  const pricing = usePricing();
  const checkout = usePackCheckout();
  return (
    <Sheet title="Get more CVs" onClose={onClose}>
      <p className="mb-5 text-[13px] text-hint">{message} Pick a CV pack and we&apos;ll make this CV as soon as you&apos;ve paid. Nothing you typed is lost.</p>
      {pricing.data ? (
        <PackCards
          packs={pricing.data.packs}
          busyId={checkout.isPending ? checkout.variables?.pack : null}
          disabled={checkout.isPending}
          onBuy={(pack) => {
            haptic.select();
            checkout.mutate({ pack }, { onSuccess: (r) => onCheckout({ id: r.paymentId, url: r.url }), onError: () => haptic.error() });
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      )}
      {checkout.error && (
        <div className="mt-3">
          <ErrorText>{checkout.error.message}</ErrorText>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          onClose();
          paywall.gate("cvs");
        }}
        className="mt-4 w-full text-center text-[13px] font-semibold text-accent-strong"
      >
        Or get Pro: new and tailored CVs every month
      </button>
    </Sheet>
  );
}

/** Waits for the pack payment, then hands back so the CV gets made. */
function PackWaiting({ payment, onPaid, onCancel }: { payment: { id: string; url: string }; onPaid: () => void; onCancel: () => void }) {
  const status = usePayment(payment.id);
  const state = status.data?.status ?? "pending";
  const done = useRef(false);
  useEffect(() => {
    if (state === "paid" && !done.current) {
      done.current = true;
      haptic.success();
      onPaid();
    }
  }, [state, onPaid]);

  if (state === "failed" || state === "cancelled") {
    return (
      <CenteredMessage
        icon={<X className="size-10 text-danger" />}
        title={state === "cancelled" ? "Payment cancelled" : "Payment didn't go through"}
        body="No money was taken. Your CV details are still here."
      >
        <Button onClick={onCancel}>Back to my CV</Button>
      </CenteredMessage>
    );
  }
  return (
    <CenteredMessage
      icon={
        <IconTile tone="neutral">
          <Loader2 className="size-5 animate-spin" />
        </IconTile>
      }
      title="Finish paying in SantimPay"
      body="Complete the payment on the page that opened, then come back. We'll make your CV as soon as it's confirmed."
    >
      <div className="flex flex-col gap-2">
        <Button onClick={() => openCheckout(payment.url)}>Open payment page again</Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </CenteredMessage>
  );
}
