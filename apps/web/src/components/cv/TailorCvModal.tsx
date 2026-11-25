"use client";

import { ArrowRight, Briefcase, Check, CheckCircle2, Compass, FilePlus2, FileText, PenLine, RefreshCw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CvGenerateRequest, CvSummaryDto, JobCardDto } from "@ethio/shared";
import { ContactForm } from "./ContactForm";
import { MIN_SOURCE_CHARS, MinLengthHint, PackPrompt, Working, openCheckout } from "./flow";
import { useGenerateCv, useImportCv } from "./hooks";
import { FlowModal, OptionCard, PayingStep, StepTitle } from "./NewCvModal";
import { useBackButton } from "../miniapp/hooks";
import { useSession } from "../miniapp/session";
import { MoxieLoader } from "../moxie";
import { Button, ErrorText, IconTile, cx } from "../ui";
import { ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";

/**
 * "Get a custom-made CV for this job" (job page): the same clean modal as
 * creating and improving a CV on the CV tab, one step at a time.
 *
 *   [your details, first time] → which CV to tailor (or make a new one)
 *     no CV yet: write it or upload it (free) → Moxie makes it, then tailors it
 *   the job is in another field: what to do next (nothing is charged)
 */

type Step = "details" | "pick" | "source" | "write" | "mismatch" | "paying";
type Mismatch = { reason: string; missing: string[]; newCvId?: string };

const PROMPT = `For example:
• Your current or last job: title, company, years, what you did and achieved
• Earlier jobs
• Education: degree, field, university, year
• Skills, software and languages`;

export function TailorCvModal({
  job,
  bases,
  freeTailoring,
  onClose,
}: {
  job: JobCardDto;
  /** Their base CVs, newest first. */
  bases: CvSummaryDto[];
  /** Their one free tailored CV is still unused. */
  freeTailoring: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { me } = useSession();
  const generate = useGenerateCv();
  const importCv = useImportCv();
  const fileInput = useRef<HTMLInputElement>(null);
  const first: Step = bases.length ? "pick" : "source";
  const [step, setStep] = useState<Step>(me.cvContact ? first : "details");
  const [withDetails] = useState(!me.cvContact);
  const [picked, setPicked] = useState<string | null>(bases[0]?.id ?? null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<"base" | "tailor">("tailor");
  const [mismatch, setMismatch] = useState<Mismatch | null>(null);
  const [blocked, setBlocked] = useState<{ req: CvGenerateRequest; thenTailor: boolean; message: string } | null>(null);
  const [payment, setPayment] = useState<{ id: string; url: string } | null>(null);
  const busy = generate.isPending || importCv.isPending;
  useBackButton(busy ? null : onClose);

  /** Tailors; with no CV yet, makes the free base CV from what they gave first, then tailors it. */
  const run = async (req: CvGenerateRequest, thenTailor: boolean) => {
    setMismatch(null);
    try {
      setPhase(thenTailor ? "base" : "tailor");
      const res = await generate.mutateAsync(req);
      if (res.status === "mismatch") {
        haptic.error();
        setMismatch({ reason: res.reason, missing: res.missing });
        return setStep("mismatch");
      }
      if (!thenTailor) {
        haptic.success();
        return router.push(`/app/cvs/${res.cv.id}`);
      }
      setPhase("tailor");
      const tailored = await generate.mutateAsync({ flow: "tailor", jobId: job.id, baseCvId: res.cv.id });
      if (tailored.status === "mismatch") {
        haptic.error();
        setMismatch({ reason: tailored.reason, missing: tailored.missing, newCvId: res.cv.id });
        return setStep("mismatch");
      }
      haptic.success();
      router.push(`/app/cvs/${tailored.cv.id}`);
    } catch (err) {
      haptic.error();
      if (err instanceof ApiError && err.status === 402) setBlocked({ req, thenTailor, message: err.message });
    }
  };

  const tailorSaved = (baseCvId: string) => void run({ flow: "tailor", jobId: job.id, baseCvId }, false);

  /** A new base CV from their words or file (free when it's their first), then the tailoring. */
  const makeBase = (flow: "create" | "improve", sourceText: string) => {
    const c = me.cvContact;
    if (!c) return;
    void run(
      {
        flow,
        sourceText,
        forJobId: job.id,
        name: c.name,
        email: c.email ?? undefined,
        phone: c.phone ?? undefined,
        location: c.location ?? undefined,
      },
      true,
    );
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    importCv.mutate(file, {
      onSuccess: (r) => {
        if (r.text.trim().length >= MIN_SOURCE_CHARS) makeBase("improve", r.text);
        else {
          haptic.error();
          setText(r.text);
          setStep("write");
        }
      },
      onError: () => haptic.error(),
    });
  };

  const error =
    generate.error instanceof ApiError ? (generate.error.status === 402 ? null : generate.error.message) : generate.error ? "Something went wrong. Please try again." : null;
  const stepNo = withDetails && step !== "mismatch" ? (step === "details" ? 1 : 2) : null;
  const jobLine = [job.title, job.company].filter(Boolean).join(" · ");

  const loader = importCv.isPending ? (
    <MoxieLoader
      animation="read"
      crowned={me.plan !== "free"}
      messages={[fileName ? `Reading ${fileName}…` : "Reading your CV…", "Finding your jobs and dates…", "Picking out your skills…"]}
    />
  ) : generate.isPending ? (
    <Working phase={phase} flow="tailor" jobTitle={job.title} />
  ) : null;

  return (
    <>
      <FlowModal stepKey={step} onClose={busy ? undefined : onClose} hidden={!!loader}>
        {stepNo && <p className="mb-1.5 text-center text-[12px] font-semibold text-accent-strong">Step {stepNo} of 2</p>}

        {step === "details" && (
          <>
            <StepTitle title="Your details" body="Printed at the top of your CV." />
            <ContactForm
              submitLabel="Continue"
              onSaved={() => {
                haptic.success();
                setStep(first);
              }}
            />
          </>
        )}

        {step === "pick" && (
          <>
            <StepTitle title="Tailor a CV to this job" body={jobLine} />
            <p className="mb-2 px-1 text-[13px] font-semibold">Which CV should we use?</p>
            <div className="flex flex-col gap-2">
              {bases.map((cv) => (
                <button
                  key={cv.id}
                  type="button"
                  onClick={() => setPicked(cv.id)}
                  aria-pressed={picked === cv.id}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-2xl border bg-surface p-3.5 text-left transition-colors",
                    picked === cv.id ? "border-ink ring-1 ring-ink" : "border-separator",
                  )}
                >
                  <IconTile tone="emerald" size="sm">
                    <FileText />
                  </IconTile>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{cv.title}</span>
                  {picked === cv.id && <Check className="size-4 shrink-0 text-ink" />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setStep("source")} className="mt-3 w-full text-center text-[13px] font-semibold text-accent-strong">
              Make a new CV for this job instead
            </button>
            <div className="mt-5 flex flex-col gap-2.5">
              {error && <ErrorText>{error}</ErrorText>}
              <Button variant="accent" disabled={!picked || busy} onClick={() => picked && tailorSaved(picked)}>
                Tailor my CV
                <ArrowRight className="size-4" />
              </Button>
              {freeTailoring && <p className="text-center text-[12px] text-hint">Your first tailored CV is free.</p>}
            </div>
          </>
        )}

        {step === "source" && (
          <>
            <StepTitle title="First, your CV" body="We make it, then tailor it to this job." />
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="flex flex-col gap-3">
              <OptionCard
                icon={PenLine}
                tone="accent"
                title="Write it"
                body="Tell us about your work in plain words"
                onClick={() => {
                  haptic.select();
                  setStep("write");
                }}
              />
              <OptionCard
                icon={Upload}
                tone="sky"
                title="Upload my CV"
                body="PDF, Word or a photo"
                onClick={() => {
                  haptic.select();
                  fileInput.current?.click();
                }}
              />
            </div>
            {importCv.error && (
              <div className="mt-3">
                <ErrorText>{importCv.error.message}</ErrorText>
              </div>
            )}
            {error && (
              <div className="mt-3">
                <ErrorText>{error}</ErrorText>
              </div>
            )}
            {bases.length > 0 && (
              <button type="button" onClick={() => setStep("pick")} className="mt-4 w-full text-center text-[13px] font-semibold text-hint">
                Back to my CVs
              </button>
            )}
          </>
        )}

        {step === "write" && (
          <>
            <StepTitle title="Tell us about yourself" body="Your jobs, education and skills. The more you tell us, the better your CV." />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={PROMPT}
              className="w-full resize-none rounded-2xl border border-separator bg-surface p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-hint-light focus:border-ink"
            />
            <MinLengthHint length={text.trim().length} what="write a few sentences about your work" />
            <div className="mt-5 flex flex-col gap-2.5">
              {error && <ErrorText>{error}</ErrorText>}
              <div className="flex gap-2">
                <Button variant="secondary" className="w-1/3" onClick={() => setStep("source")}>
                  Back
                </Button>
                <Button variant="accent" className="flex-1" disabled={text.trim().length < MIN_SOURCE_CHARS || busy} onClick={() => makeBase("create", text)}>
                  Make it and tailor it
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "mismatch" && mismatch && (
          <MismatchStep
            m={mismatch}
            otherCvs={bases.length > 1 && !mismatch.newCvId}
            freeTailoring={freeTailoring}
            onFeed={() => router.push("/app/jobs")}
            onOpenNew={mismatch.newCvId ? () => router.push(`/app/cvs/${mismatch.newCvId}`) : undefined}
            onOtherCv={() => setStep("pick")}
            onNewCv={() => setStep("source")}
          />
        )}

        {step === "paying" && payment && blocked && (
          <PayingStep
            payment={payment}
            onPaid={() => {
              const retry = blocked;
              setPayment(null);
              setBlocked(null);
              setStep(retry.thenTailor ? "source" : "pick");
              void run(retry.req, retry.thenTailor);
            }}
            onCancel={() => {
              setPayment(null);
              setStep(blocked.thenTailor ? "source" : "pick");
            }}
          />
        )}
      </FlowModal>

      {loader}

      {blocked && !payment && (
        <PackPrompt
          message={blocked.message}
          onClose={() => setBlocked(null)}
          onCheckout={(p) => {
            setPayment(p);
            setStep("paying");
            openCheckout(p.url);
          }}
        />
      )}
    </>
  );
}

/** The job is in another field: we don't invent experience. Say so, and offer real ways forward. */
function MismatchStep({
  m,
  otherCvs,
  freeTailoring,
  onFeed,
  onOpenNew,
  onOtherCv,
  onNewCv,
}: {
  m: Mismatch;
  otherCvs: boolean;
  freeTailoring: boolean;
  onFeed: () => void;
  onOpenNew?: () => void;
  onOtherCv: () => void;
  onNewCv: () => void;
}) {
  return (
    <>
      <div className="flex justify-center">
        <IconTile tone="neutral">
          <Compass className="size-5" />
        </IconTile>
      </div>
      <div className="mt-3">
        <StepTitle title="This job needs a different background" body={m.reason} />
      </div>
      {m.missing.length > 0 && (
        <>
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-hint-light">The job asks for</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.missing.slice(0, 8).map((x) => (
              <span key={x} className="rounded-full border border-separator bg-pill/60 px-2.5 py-1 text-[12px] font-medium">
                {x}
              </span>
            ))}
          </div>
        </>
      )}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-emerald-soft px-3.5 py-3 text-[13px] text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald" />
        <span>
          Nothing was charged{freeTailoring ? ", and your free tailored CV is still yours" : ""}.{onOpenNew ? " Your new CV is saved." : ""}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        <OptionCard icon={Briefcase} tone="sky" title="See jobs that fit my CV" body="Your feed, matched to your field" onClick={onFeed} />
        {onOpenNew && <OptionCard icon={FileText} tone="emerald" title="Open my new CV" onClick={onOpenNew} />}
        {otherCvs && <OptionCard icon={RefreshCw} tone="violet" title="Try another of my CVs" onClick={onOtherCv} />}
        {!onOpenNew && <OptionCard icon={FilePlus2} tone="accent" title="I do have this experience" body="Write a new CV that shows it" onClick={onNewCv} />}
      </div>
    </>
  );
}
