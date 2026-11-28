"use client";

import { ArrowRight, Check, ChevronRight, FileText, PenLine, Upload, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CvGenerateRequest, CvQuotaDto, CvSummaryDto } from "@ethio/shared";
import { ContactForm, Field } from "./ContactForm";
import { MIN_SOURCE_CHARS, MinLengthHint, PackPrompt, Working, openCheckout, useWorkingHold } from "./flow";
import { useGenerateCv, useImportCv } from "./hooks";
import { useBackButton, usePayment } from "../miniapp/hooks";
import { useSession } from "../miniapp/session";
import { MoxieLoader } from "../moxie";
import { Portal } from "../Portal";
import { Button, ErrorText, IconTile, cx, type IconTone } from "../ui";
import { ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";

/**
 * New CV, as on gomoxie.app: a centered modal over the CV tab, one short step
 * at a time (each slides in), Moxie over the whole screen while the AI works,
 * then straight to the new CV.
 *
 *   Create:  [your details] → tell us about yourself → Moxie writes it
 *   Improve: [your details] → upload a file, or pick one of my CVs → Moxie improves it
 *
 * "Your details" only shows the first time (they're printed on every CV).
 */

type Step = "details" | "write" | "source" | "paste" | "pick" | "paying";

const PROMPT = `For example:
• Your current or last job: title, company, years, what you did and achieved
• Earlier jobs
• Education: degree, field, university, year
• Skills, software and languages
• Certificates or training`;

export function NewCvModal({
  flow,
  quota,
  cvs,
  onClose,
}: {
  flow: "create" | "improve";
  quota: CvQuotaDto;
  /** Their saved CVs, newest first ("Improve" can start from one). */
  cvs: CvSummaryDto[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { me } = useSession();
  const generate = useGenerateCv();
  const importCv = useImportCv();
  const fileInput = useRef<HTMLInputElement>(null);
  const firstStep: Step = flow === "create" ? "write" : "source";
  const [step, setStep] = useState<Step>(me.cvContact ? firstStep : "details");
  const [withDetails] = useState(!me.cvContact);
  const [text, setText] = useState("");
  const [focus, setFocus] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(cvs[0]?.id ?? null);
  const [blocked, setBlocked] = useState<{ req: CvGenerateRequest; message: string } | null>(null);
  const [payment, setPayment] = useState<{ id: string; url: string } | null>(null);
  const hold = useWorkingHold();
  const busy = generate.isPending || importCv.isPending || hold.active;
  useBackButton(busy ? null : onClose);

  const run = async (req: CvGenerateRequest) => {
    hold.start();
    try {
      const res = await generate.mutateAsync(req);
      if (res.status !== "mismatch") {
        haptic.success();
        const id = res.cv.id;
        await hold.finish(() => router.push(`/app/cvs/${id}`));
      } else hold.stop();
    } catch (err) {
      hold.stop();
      haptic.error();
      // 402: nothing left on the plan or in credits. Offer packs; the request waits.
      if (err instanceof ApiError && err.status === 402) setBlocked({ req, message: err.message });
    }
  };

  const submit = (sourceText: string) => {
    const c = me.cvContact;
    if (!c) return;
    void run({
      flow,
      sourceText,
      name: c.name,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      location: c.location ?? undefined,
      focus: focus.trim() || undefined,
    });
  };

  /** Improve one of their saved CVs: the API reads it (and keeps its design). */
  const improveSaved = (baseCvId: string) => {
    const c = me.cvContact;
    if (!c) return;
    void run({ flow: "improve", baseCvId, name: c.name, email: c.email ?? undefined, focus: focus.trim() || undefined });
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    importCv.mutate(file, {
      onSuccess: (r) => {
        if (r.text.trim().length >= MIN_SOURCE_CHARS) submit(r.text);
        else {
          // Too little came out (e.g. a blurry photo): let them paste it.
          haptic.error();
          setText(r.text);
          setStep("paste");
        }
      },
      onError: () => haptic.error(),
    });
  };

  const error =
    generate.error instanceof ApiError ? (generate.error.status === 402 ? null : generate.error.message) : generate.error ? "Something went wrong. Please try again." : null;
  const stepNo = withDetails ? (step === "details" ? 1 : 2) : null;

  // While the AI works Moxie takes the whole screen; the modal stays mounted (and keeps what they typed).
  const loader = importCv.isPending ? (
    <MoxieLoader
      animation="read"
      crowned={me.plan !== "free"}
      messages={[fileName ? `Reading ${fileName}…` : "Reading your CV…", "Finding your jobs and dates…", "Picking out your skills…"]}
    />
  ) : generate.isPending || hold.active ? (
    <Working phase="base" flow={flow} done={hold.done} />
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
                setStep(firstStep);
              }}
            />
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
            <MinLengthHint length={text.trim().length} what={"write a few sentences about your work"} />
            <Footer error={error} quota={quota} flow={flow}>
              <Button variant="accent" disabled={text.trim().length < MIN_SOURCE_CHARS || busy} onClick={() => submit(text)}>
                Create my CV
                <ArrowRight className="size-4" />
              </Button>
            </Footer>
          </>
        )}

        {step === "source" && (
          <>
            <StepTitle title="Add your current CV" body="We'll rewrite it to stand out." />
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
            <div className="flex flex-col gap-3">
              <OptionCard
                icon={Upload}
                tone="sky"
                title="Upload a file"
                body="PDF, Word or a photo"
                onClick={() => {
                  haptic.select();
                  fileInput.current?.click();
                }}
              />
              {cvs.length > 0 && (
                <OptionCard
                  icon={FileText}
                  tone="violet"
                  title="Choose one of my CVs"
                  body={cvs.length === 1 ? cvs[0]!.title : `${cvs.length} saved here`}
                  onClick={() => {
                    haptic.select();
                    setStep("pick");
                  }}
                />
              )}
            </div>
            {importCv.error && (
              <div className="mt-3">
                <ErrorText>{importCv.error.message}</ErrorText>
              </div>
            )}
            <Footer error={error} quota={quota} flow={flow} />
          </>
        )}

        {step === "pick" && (
          <>
            <StepTitle title="Choose a CV" body="We'll make a stronger copy. The original stays as it is." />
            <div className="flex flex-col gap-2">
              {cvs.map((cv) => (
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
                  <IconTile tone={cv.kind === "tailored" ? "violet" : "emerald"} size="sm">
                    <FileText />
                  </IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{cv.title}</span>
                    <span className="block truncate text-[12px] text-hint">{cv.kind === "tailored" ? `Tailored${cv.jobTitle ? ` for ${cv.jobTitle}` : ""}` : "Base CV"}</span>
                  </span>
                  {picked === cv.id && <Check className="size-4 shrink-0 text-ink" />}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Field label="Anything to focus on? (optional)" value={focus} onChange={setFocus} placeholder="e.g. aim for a senior role, highlight leadership" />
            </div>
            <Footer error={error} quota={quota} flow={flow}>
              <div className="flex gap-2">
                <Button variant="secondary" className="w-1/3" onClick={() => setStep("source")}>
                  Back
                </Button>
                <Button variant="accent" className="flex-1" disabled={!picked || busy} onClick={() => picked && improveSaved(picked)}>
                  Improve this CV
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </Footer>
          </>
        )}

        {step === "paste" && (
          <>
            <StepTitle title="Paste your CV" body="All of it. The formatting doesn't matter." />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Paste your CV's text here."
              className="w-full resize-none rounded-2xl border border-separator bg-surface p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-hint-light focus:border-ink"
            />
            <MinLengthHint length={text.trim().length} what={"paste your whole CV"} />
            <div className="mt-3">
              <Field label="Anything to focus on? (optional)" value={focus} onChange={setFocus} placeholder="e.g. aim for a senior role, highlight leadership" />
            </div>
            <Footer error={error} quota={quota} flow={flow}>
              <div className="flex gap-2">
                <Button variant="secondary" className="w-1/3" onClick={() => setStep("source")}>
                  Back
                </Button>
                <Button variant="accent" className="flex-1" disabled={text.trim().length < MIN_SOURCE_CHARS || busy} onClick={() => submit(text)}>
                  Improve my CV
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </Footer>
          </>
        )}

        {step === "paying" && payment && blocked && (
          <PayingStep
            payment={payment}
            onPaid={() => {
              const retry = blocked.req;
              setPayment(null);
              setBlocked(null);
              setStep(flow === "create" ? "write" : retry.baseCvId ? "pick" : text ? "paste" : "source");
              void run(retry);
            }}
            onCancel={() => {
              setPayment(null);
              setStep(flow === "create" ? "write" : blocked.req.baseCvId ? "pick" : text ? "paste" : "source");
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

/** The modal frame: centered card, close button, each step sliding in. */
export function FlowModal({ stepKey, onClose, hidden, children }: { stepKey: string; onClose?: () => void; hidden?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <Portal>
      <div
        className={cx("fixed inset-0 z-40 flex items-center justify-center p-4 transition-opacity", hidden && "pointer-events-none opacity-0")}
        role="dialog"
        aria-modal="true"
      >
        <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-[fade-in_0.2s_ease-out]" />
        <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-separator bg-surface shadow-[0_24px_64px_-24px_rgba(15,17,21,0.45)] animate-[modal-in_0.22s_ease-out]">
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-full bg-pill text-hint">
              <X className="size-4" />
            </button>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pt-7">
            <div key={stepKey} className="animate-[step-in_0.28s_ease-out]">
              {children}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function StepTitle({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mb-5 px-6 text-center">
      <h2 className="text-[22px] font-bold leading-tight tracking-tight">{title}</h2>
      {body && <p className="mt-1.5 text-[14px] leading-snug text-hint">{body}</p>}
    </div>
  );
}

function Footer({ error, quota, flow, children }: { error: string | null; quota: CvQuotaDto; flow: "create" | "improve"; children?: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {error && <ErrorText>{error}</ErrorText>}
      {children}
    </div>
  );
}

/** A step option, as on gomoxie.app: icon tile, title and line, chevron. */
export function OptionCard({ icon: Icon, tone, title, body, onClick }: { icon: LucideIcon; tone: IconTone; title: string; body?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-separator bg-surface p-4 text-left shadow-[0_10px_28px_-18px_rgba(15,17,21,0.35)] transition-transform active:scale-[0.99]"
    >
      <IconTile tone={tone}>
        <Icon className="size-5" />
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        {body && <span className="mt-0.5 block text-[13px] leading-snug text-hint">{body}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-hint-light" />
    </button>
  );
}

/** Waiting for a CV pack payment inside the modal; on payment the CV is made straight away. */
export function PayingStep({ payment, onPaid, onCancel }: { payment: { id: string; url: string }; onPaid: () => void; onCancel: () => void }) {
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
  const failed = state === "failed" || state === "cancelled";
  return (
    <div className="text-center">
      <div className="flex justify-center">
        <IconTile tone="neutral">{failed ? <X className="size-5 text-danger" /> : <PenLine className="size-5" />}</IconTile>
      </div>
      <StepTitle
        title={failed ? (state === "cancelled" ? "Payment cancelled" : "Payment didn't go through") : "Finish paying in SantimPay"}
        body={failed ? "No money was taken. What you typed is still here." : "Complete the payment on the page that opened, then come back. We make your CV as soon as it's confirmed."}
      />
      <div className="flex flex-col gap-2">
        {!failed && <Button onClick={() => openCheckout(payment.url)}>Open payment page again</Button>}
        <Button variant={failed ? "primary" : "ghost"} onClick={onCancel}>
          {failed ? "Back" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
