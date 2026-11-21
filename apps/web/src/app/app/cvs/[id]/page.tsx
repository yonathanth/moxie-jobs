"use client";

import { Check, CheckCircle2, Clock, Eye, Lock, Palette, PencilLine, Send, Target, Trash2, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CvContent, CvDetailDto, CvReviewTip } from "@ethio/shared";
import { CvEditor, type EditorTarget } from "@/components/cv/editor/CvEditor";
import { CvPreview } from "@/components/cv/CvPreview";
import { useCv, useCvCheckout, useCvPreview, useCvTemplates, useDeleteCv, usePolishCv, useReviewCv, useSendCv, useUpdateCv } from "@/components/cv/hooks";
import { ScoreBadge, ScoreSheet } from "@/components/cv/ScorePanel";
import { useBackButton, usePayment } from "@/components/miniapp/hooks";
import { CvPageSkeleton, PaperSkeleton, TemplatesSkeleton } from "@/components/skeletons";
import { Badge, Button, CenteredMessage, cx, ErrorText, IconTile, Sheet, Spinner, StickyFooter } from "@/components/ui";
import { scoreContent, type PolishTarget } from "@/lib/cv-score";
import { formatBirr } from "@/lib/plans";
import { getWebApp, haptic } from "@/lib/telegram";

function openCheckout(url: string) {
  const wa = getWebApp();
  if (wa) wa.openLink(url);
  else window.open(url, "_blank", "noopener");
}

export default function CvPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const cv = useCv(id);

  if (cv.isPending) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-28 pt-5">
        <CvPageSkeleton />
      </main>
    );
  }
  if (cv.isError) {
    return (
      <CenteredMessage title="Couldn't open this CV" body={cv.error.message}>
        <Button onClick={() => router.push("/app/cvs")}>Back to my CVs</Button>
      </CenteredMessage>
    );
  }
  // Keyed by id: the editor's draft starts from this CV once, then lives locally (autosaved).
  return <CvWorkspace key={cv.data.id} initial={cv.data} />;
}

const AUTOSAVE_MS = 900;

function CvWorkspace({ initial }: { initial: CvDetailDto }) {
  const router = useRouter();
  const cv = useCv(initial.id);
  const doc = cv.data ?? initial;
  const update = useUpdateCv(doc.id);
  const polish = usePolishCv(doc.id);
  const review = useReviewCv(doc.id);

  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [sheet, setSheet] = useState<"score" | "design" | null>(null);
  const [payment, setPayment] = useState<{ id: string; url: string } | null>(null);
  const [draft, setDraft] = useState<CvContent>(() => structuredClone(initial.content));
  const [pendingSave, setPendingSave] = useState(false);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [polishingKey, setPolishingKey] = useState<string | null>(null);
  const [tips, setTips] = useState<CvReviewTip[] | null>(null);
  const [undo, setUndo] = useState<{ content: CvContent; from: number; to: number } | null>(null);

  const preview = useCvPreview(doc.id, `${doc.updatedAt}:${doc.templateId}`);
  const score = useMemo(() => scoreContent(draft, doc.jobRequirements), [draft, doc.jobRequirements]);

  // Autosave: the draft goes to the server a moment after typing stops (and on leaving the page).
  const latest = useRef({ draft, pendingSave, save: update.mutate });
  useEffect(() => {
    latest.current = { draft, pendingSave, save: update.mutate };
  });
  useEffect(() => {
    if (!pendingSave) return;
    const t = setTimeout(() => {
      setPendingSave(false);
      latest.current.save({ content: latest.current.draft });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, pendingSave]);
  useEffect(
    () => () => {
      if (latest.current.pendingSave) latest.current.save({ content: latest.current.draft });
    },
    [],
  );
  const edit = (next: CvContent) => {
    setDraft(next);
    setPendingSave(true);
  };

  useBackButton(() => {
    if (sheet) setSheet(null);
    else if (tab === "edit") setTab("preview");
    else router.push("/app/cvs");
  });

  const goTo = (t: { section: string; index?: number; field?: string }) => {
    setTab("edit");
    setTarget({ ...t, nonce: Date.now() });
  };

  const runPolish = (targets: PolishTarget[] | "all", key: string) => {
    setPolishingKey(key);
    const before = draft;
    polish.mutate(
      { content: draft, targets },
      {
        onSuccess: (r) => {
          haptic.success();
          edit(r.content);
          setUndo({ content: before, from: r.score, to: r.projectedScore });
          setSheet(null);
        },
        onError: () => haptic.error(),
        onSettled: () => setPolishingKey(null),
      },
    );
  };

  if (payment) return <UnlockWaiting cv={doc} payment={payment} onDone={() => setPayment(null)} />;

  const saving = update.isPending || pendingSave;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-44 pt-5 animate-fade-up">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm text-hint">
            {doc.kind === "tailored" ? "Tailored CV" : doc.flow === "improve" ? "Improved CV" : "Base CV"}
            {doc.locked && (
              <Badge tone="accent">
                <Lock className="size-3" />
                Unpaid
              </Badge>
            )}
          </p>
          <h1 className="mt-0.5 text-[21px] font-bold leading-tight tracking-tight">{doc.title}</h1>
          {doc.jobId && doc.jobTitle && (
            <Link href={`/app/jobs/${doc.jobId}`} className="mt-1 inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-accent-strong">
              <Target className="size-3.5 shrink-0" />
              <span className="truncate">{doc.jobTitle}</span>
            </Link>
          )}
        </div>
        <ScoreBadge score={score} onOpen={() => setSheet("score")} />
      </header>

      {/* Preview | Edit, kept in reach while scrolling. */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 bg-bg/90 px-4 py-2 backdrop-blur">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-separator bg-surface p-1">
          {(
            [
              ["preview", "Preview", Eye],
              ["edit", "Edit", PencilLine],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                haptic.select();
                setTab(key);
              }}
              className={cx("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors", tab === key ? "bg-ink text-white" : "text-hint")}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {undo && (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px]">
          <Check className="size-4 shrink-0 text-emerald-700" />
          <span className="flex-1 text-emerald-900">
            Polished. Score {undo.from} → <strong>{undo.to}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              edit(undo.content);
              setUndo(null);
            }}
            className="inline-flex items-center gap-1 font-semibold text-emerald-800"
          >
            <Undo2 className="size-3.5" />
            Undo
          </button>
        </div>
      )}
      {polish.error && !sheet && <p className="mt-2 text-center text-sm text-danger">{polish.error.message}</p>}

      {tab === "preview" ? (
        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[12px] text-hint">{saving ? "Saving…" : preview.isFetching ? "Updating preview…" : "Exactly how the PDF looks"}</span>
            <button type="button" onClick={() => setSheet("design")} className="inline-flex items-center gap-1.5 rounded-lg border border-separator bg-surface px-3 py-1.5 text-[13px] font-semibold">
              <Palette className="size-4 text-accent" />
              Design
            </button>
          </div>
          {preview.data ? (
            <CvPreview html={preview.data.html} watermark={doc.locked} loading={preview.isFetching || saving} />
          ) : preview.isError ? (
            <ErrorText>{preview.error.message}</ErrorText>
          ) : (
            <PaperSkeleton />
          )}
        </div>
      ) : (
        <div className="mt-2">
          <p className="mb-2 flex items-center gap-1.5 px-1 text-[12px] text-hint">
            {saving ? (
              <>
                <Spinner size="xs" /> Saving…
              </>
            ) : update.isError ? (
              <span className="text-danger">Not saved: {update.error.message}</span>
            ) : (
              <>
                <Check className="size-3.5 text-emerald" /> All changes saved
              </>
            )}
          </p>
          <CvEditor content={draft} onChange={edit} target={target} />
          <DeleteButton id={doc.id} />
        </div>
      )}

      <Actions cv={doc} onCheckout={setPayment} flushing={saving} />

      {sheet === "score" && (
        <ScoreSheet
          score={score}
          content={draft}
          canPolish={doc.canPolish}
          gaps={doc.gaps}
          isTailored={doc.kind === "tailored"}
          onClose={() => setSheet(null)}
          onGoTo={goTo}
          onPolish={runPolish}
          polishingKey={polishingKey}
          onReview={() => review.mutate(draft, { onSuccess: (t) => setTips(t.tips), onError: () => haptic.error() })}
          reviewing={review.isPending}
          tips={tips}
        />
      )}
      {sheet === "design" && <DesignSheet cv={doc} onClose={() => setSheet(null)} />}
    </main>
  );
}

/* ---------- send / unlock ---------- */

function Actions({ cv, onCheckout, flushing }: { cv: CvDetailDto; onCheckout: (p: { id: string; url: string }) => void; flushing: boolean }) {
  const send = useSendCv(cv.id);
  const checkout = useCvCheckout(cv.id);
  const [sent, setSent] = useState(false);

  const doSend = () =>
    send.mutate(undefined, {
      onSuccess: (r) => {
        if (r.sent) {
          haptic.success();
          setSent(true);
        } else haptic.error();
      },
      onError: () => haptic.error(),
    });
  const unlock = () =>
    checkout.mutate(undefined, {
      onSuccess: (r) => {
        onCheckout({ id: r.paymentId, url: r.url });
        openCheckout(r.url);
      },
      onError: () => haptic.error(),
    });

  const error = send.error?.message ?? checkout.error?.message ?? (send.data && !send.data.sent ? "Couldn't send it. Open the bot chat, press Start, then try again." : null);

  return (
    <StickyFooter>
      {error && <ErrorText>{error}</ErrorText>}
      {sent && !error && <p className="text-center text-[13px] font-medium text-emerald">Sent. Check your chat with the bot.</p>}
      {cv.locked ? (
        <>
          <div className="flex gap-2">
            <Button variant="secondary" className="w-auto flex-1" loading={send.isPending} disabled={flushing} onClick={doSend}>
              Preview PDF
            </Button>
            <Button variant="accent" className="w-auto flex-[2]" loading={checkout.isPending} onClick={unlock}>
              <Lock className="size-4" />
              Unlock · {cv.unlockPrice ? formatBirr(cv.unlockPrice) : ""}
            </Button>
          </div>
          <p className="text-center text-[11px] text-hint">The preview PDF is watermarked. Unlocking sends you the clean one.</p>
        </>
      ) : (
        <Button variant="accent" loading={send.isPending} disabled={flushing} onClick={doSend}>
          <Send className="size-4" />
          Send PDF to my chat
        </Button>
      )}
    </StickyFooter>
  );
}

function UnlockWaiting({ cv, payment, onDone }: { cv: CvDetailDto; payment: { id: string; url: string }; onDone: () => void }) {
  const status = usePayment(payment.id);
  const fresh = useCv(cv.id);
  const state = status.data?.status ?? "pending";

  useEffect(() => {
    if (state === "paid") {
      haptic.success();
      void fresh.refetch();
    } else if (state === "failed" || state === "cancelled") haptic.error();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === "paid") {
    return (
      <CenteredMessage
        icon={
          <IconTile tone="emerald">
            <CheckCircle2 className="size-5" />
          </IconTile>
        }
        title="Your CV is unlocked"
        body="We sent the clean PDF to your chat with the bot."
      >
        <Button onClick={onDone}>Back to my CV</Button>
      </CenteredMessage>
    );
  }
  if (state === "failed" || state === "cancelled") {
    return (
      <CenteredMessage
        icon={<XCircle className="size-10 text-danger" />}
        title={state === "cancelled" ? "Payment cancelled" : "Payment didn't go through"}
        body="No money was taken. You can try again whenever you're ready."
      >
        <Button onClick={onDone}>Back to my CV</Button>
      </CenteredMessage>
    );
  }
  return (
    <CenteredMessage
      icon={
        <IconTile tone="neutral">
          <Clock className="size-5" />
        </IconTile>
      }
      title="Finish paying in SantimPay"
      body="Complete the payment on the page that opened, then come back. We'll send the clean PDF as soon as it's confirmed."
    >
      <div className="flex flex-col gap-2">
        <div className="mb-2 flex items-center justify-center gap-2 text-sm text-hint">
          <Spinner />
          Waiting for confirmation…
        </div>
        <Button onClick={() => openCheckout(payment.url)}>Open payment page again</Button>
        <Button variant="ghost" onClick={onDone}>
          Back
        </Button>
      </div>
    </CenteredMessage>
  );
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const del = useDeleteCv();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mt-6 flex justify-center">
      {confirm ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-hint">Delete this CV?</span>
          <button type="button" className="font-semibold text-danger" disabled={del.isPending} onClick={() => del.mutate(id, { onSuccess: () => router.replace("/app/cvs") })}>
            {del.isPending ? "Deleting…" : "Delete"}
          </button>
          <button type="button" className="font-semibold text-hint" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-hint">
          <Trash2 className="size-4" />
          Delete CV
        </button>
      )}
    </div>
  );
}

/* ---------- design ---------- */

function DesignSheet({ cv, onClose }: { cv: CvDetailDto; onClose: () => void }) {
  const templates = useCvTemplates();
  const update = useUpdateCv(cv.id);
  return (
    <Sheet title="Design" onClose={onClose}>
      <p className="mb-3 text-[13px] text-hint">Pick a template. Your content stays the same.</p>
      {templates.isPending ? (
        <TemplatesSkeleton />
      ) : templates.isError ? (
        <ErrorText>{templates.error.message}</ErrorText>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 pb-2">
          {templates.data.map((t) => {
            const active = t.id === cv.templateId;
            const pending = update.isPending && update.variables?.templateId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={update.isPending}
                onClick={() => {
                  haptic.select();
                  if (!active) update.mutate({ templateId: t.id });
                }}
                className="text-left"
              >
                <span className={cx("relative block aspect-[1/1.414] overflow-hidden rounded-lg border bg-white", active ? "border-ink ring-2 ring-ink" : "border-separator")}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote GoMoxie thumbnails */}
                  <img src={t.previewUrl} alt={t.name} loading="lazy" className="absolute inset-0 size-full object-cover object-top" />
                  {(active || pending) && (
                    <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-ink text-white">
                      {pending ? <Spinner size="xs" light /> : <Check className="size-3" />}
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-[12px] font-medium">{t.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {update.error && <ErrorText>{update.error.message}</ErrorText>}
    </Sheet>
  );
}
