"use client";

import { Briefcase, Check, CheckCircle2, Clock, Download, Save, Eye, Lock, MessageCircle, Palette, PencilLine, Target, Trash2, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CvContent, CvDetailDto, CvReviewTip } from "@ethio/shared";
import { CvEditor, type EditorTarget } from "@/components/cv/editor/CvEditor";
import { CvPreview } from "@/components/cv/CvPreview";
import { PackCards } from "@/components/cv/PackCards";
import { useCv, useCvPreview, useCvTemplates, useDeleteCv, usePackCheckout, usePolishCv, useReviewCv, useSendCv, useUnlockCv, useUpdateCv } from "@/components/cv/hooks";
import { ScoreChip, ScoreSheet } from "@/components/cv/ScorePanel";
import { useBackButton, usePayment, usePricing } from "@/components/miniapp/hooks";
import { CvPageSkeleton, PaperSkeleton, TemplatesSkeleton } from "@/components/skeletons";
import { Badge, Button, CenteredMessage, cx, Dialog, ErrorText, IconTile, Sheet, Skeleton, Spinner, StickyFooter } from "@/components/ui";
import { BOT_URL } from "@/lib/config";
import { scoreContent, type PolishTarget } from "@/lib/cv-score";
import { getWebApp, haptic, openExternal } from "@/lib/telegram";

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
  usePreloadTemplates();
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
  // Save now (also what the Saved chip does while changes are waiting to autosave, or after a failed save).
  const saveNow = () => {
    setPendingSave(false);
    update.mutate({ content: draft }, { onSuccess: () => haptic.success(), onError: () => haptic.error() });
  };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-44 pt-5 animate-fade-up">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm text-hint">
            {doc.kind === "tailored" ? "Tailored CV" : doc.flow === "improve" ? "Improved CV" : "Base CV"}
            {doc.locked && (
              <Badge tone="accent">
                <Lock className="size-3" />
                Locked
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
      </header>

      {/* Preview | Edit and the score, kept in reach while scrolling. */}
      <div className="sticky top-0 z-20 -mx-4 mt-4 flex items-center gap-2 border-b border-separator-subtle bg-bg/90 px-4 py-2 backdrop-blur">
        {/* One toggle that names the other view: "Edit" while previewing, "Preview" while editing. */}
        {(() => {
          const [next, label, Icon] = tab === "preview" ? (["edit", "Edit", PencilLine] as const) : (["preview", "Preview", Eye] as const);
          return (
            <button
              type="button"
              onClick={() => {
                haptic.select();
                setTab(next);
              }}
              className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ink px-3.5 text-sm font-semibold text-white transition-colors"
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })()}
        <ScoreChip score={score} onOpen={() => setSheet("score")} />
        <SaveChip state={update.isPending ? "saving" : update.isError ? "error" : pendingSave ? "unsaved" : "saved"} onSave={saveNow} />
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
      {(polish.error ?? review.error) && !sheet && <p className="mt-2 text-center text-sm text-danger">{(polish.error ?? review.error)?.message}</p>}

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
          {/* The Saved chip in the bar shows save state; only a failure needs its reason spelled out. */}
          {update.isError && <p className="mb-2 px-1 text-[12px] text-danger">Not saved: {update.error.message}</p>}
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
          aiLeft={doc.aiLeft}
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

/** Save state in the top bar: Saved (with a tick), Saving…, or a Save button while changes wait or after a failed save. */
function SaveChip({ state, onSave }: { state: "saved" | "saving" | "unsaved" | "error"; onSave: () => void }) {
  if (state === "saving") {
    return (
      <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-separator bg-surface px-3 text-[13px] font-semibold text-hint" aria-live="polite">
        <Spinner size="xs" />
        Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex h-10 shrink-0 items-center gap-1 px-1 text-[13px] font-semibold text-emerald-700" aria-live="polite">
        <Check className="size-4" />
        Saved
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onSave}
      className={cx(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold",
        state === "error" ? "border border-red-200 bg-red-50 text-danger" : "bg-ink text-white",
      )}
    >
      <Save className="size-4" />
      {state === "error" ? "Retry save" : "Save"}
    </button>
  );
}

/* ---------- download / unlock ---------- */

/**
 * One button: Download. The PDF arrives in the chat with the bot (a Mini App can't save files),
 * so a success dialog says so and offers where to go next. A locked CV (plan allowance used up) is
 * downloaded by unlocking it: with a CV credit if they have one, otherwise after buying a CV pack.
 */
function Actions({ cv, onCheckout, flushing }: { cv: CvDetailDto; onCheckout: (p: { id: string; url: string }) => void; flushing: boolean }) {
  const send = useSendCv(cv.id);
  const unlock = useUnlockCv(cv.id);
  const [done, setDone] = useState(false);
  const [packs, setPacks] = useState(false);

  const download = () => {
    if (cv.locked) {
      if (cv.unlockCredits <= 0) return setPacks(true);
      // Unlocking sends the clean PDF to the chat.
      return unlock.mutate(undefined, {
        onSuccess: () => {
          haptic.success();
          setDone(true);
        },
        onError: () => haptic.error(),
      });
    }
    send.mutate(undefined, {
      onSuccess: (r) => {
        if (r.sent) {
          haptic.success();
          setDone(true);
        } else haptic.error();
      },
      onError: () => haptic.error(),
    });
  };

  const error =
    send.error?.message ??
    unlock.error?.message ??
    (send.data && !send.data.sent ? "We couldn't send it to your chat. Open the bot chat, press Start, then try again." : null);

  return (
    <>
      <StickyFooter>
        {error && <ErrorText>{error}</ErrorText>}
        <Button variant="accent" loading={send.isPending || unlock.isPending} disabled={flushing} onClick={download}>
          <Download className="size-4" />
          Download
        </Button>
        {cv.locked && (
          <p className="text-center text-[11px] text-hint">
            {cv.unlockCredits > 0
              ? `Uses 1 of your ${cv.unlockCredits} ${cv.kind === "tailored" ? "tailored" : "new"} CV ${cv.unlockCredits === 1 ? "credit" : "credits"}.`
              : "You've used the CVs in your plan. Get a CV pack to download this one."}
          </p>
        )}
      </StickyFooter>
      {packs && <PackSheet cvId={cv.id} onClose={() => setPacks(false)} onCheckout={onCheckout} />}
      {done && <DownloadedDialog cv={cv} onClose={() => setDone(false)} />}
    </>
  );
}

/** After a download: the PDF is in the chat. Next: open the chat, or go use the CV. */
function DownloadedDialog({ cv, onClose }: { cv: Pick<CvDetailDto, "jobId" | "kind">; onClose: () => void }) {
  const router = useRouter();
  const next =
    cv.kind === "tailored" && cv.jobId ? { label: "Back to the job", href: `/app/jobs/${cv.jobId}` } : { label: "Find jobs to apply to", href: "/app/jobs" };
  return (
    <Dialog
      labelId="cv-downloaded-title"
      onClose={onClose}
      icon={
        <IconTile tone="emerald">
          <CheckCircle2 className="size-5" />
        </IconTile>
      }
      title="Your CV is downloaded"
      body="We sent the PDF to your chat with the bot. Open it there to save it or send it to employers."
    >
      <Button
        onClick={() => {
          openExternal(BOT_URL);
          onClose();
        }}
      >
        <MessageCircle className="size-4" />
        Open the chat
      </Button>
      <Button variant="secondary" onClick={() => router.push(next.href)}>
        <Briefcase className="size-4" />
        {next.label}
      </Button>
      <Button variant="ghost" onClick={onClose}>
        Keep editing
      </Button>
    </Dialog>
  );
}

/** Pick a CV pack; one of its credits unlocks this CV as soon as it's paid. */
function PackSheet({ cvId, onClose, onCheckout }: { cvId: string; onClose: () => void; onCheckout: (p: { id: string; url: string }) => void }) {
  const pricing = usePricing();
  const checkout = usePackCheckout();
  return (
    <Sheet title="Get a CV pack to download" onClose={onClose}>
      <p className="mb-5 text-[13px] text-hint">One credit unlocks this CV and we send the PDF to your chat. The rest are yours for later.</p>
      {pricing.data ? (
        <PackCards
          packs={pricing.data.packs}
          busyId={checkout.isPending ? checkout.variables?.pack : null}
          disabled={checkout.isPending}
          onBuy={(pack) => {
            haptic.select();
            checkout.mutate(
              { pack, cvId },
              {
                onSuccess: (r) => {
                  onCheckout({ id: r.paymentId, url: r.url });
                  openCheckout(r.url);
                },
                onError: () => haptic.error(),
              },
            );
          }}
        />
      ) : (
        <TemplatesSkeleton />
      )}
      {checkout.error && (
        <div className="mt-3">
          <ErrorText>{checkout.error.message}</ErrorText>
        </div>
      )}
    </Sheet>
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

  if (state === "paid") return <DownloadedDialog cv={cv} onClose={onDone} />;
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
      body="Complete the payment on the page that opened, then come back. We'll send your CV to the chat as soon as it's confirmed."
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
          {templates.data.map((t, i) => {
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
                  <TemplateThumb src={t.previewUrl} alt={t.name} eager={i < 9} />
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

/**
 * A template's small cached picture (GoMoxie's thumb.webp): shimmer until it loads, then fades in.
 * The first rows load straight away; the rest when scrolled near.
 */
function TemplateThumb({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <>
      {state === "loading" && <Skeleton className="absolute inset-0 rounded-none" />}
      {state === "error" ? (
        <span className="absolute inset-0 grid place-items-center text-[10px] text-hint-light">No preview</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- cached by GoMoxie's API, not Next's image optimizer
        <img
          // A cached image can finish before React attaches onLoad (it would stay hidden): check on mount.
          ref={(img) => {
            if (img?.complete && state === "loading") setState(img.naturalWidth > 0 ? "loaded" : "error");
          }}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={cx("absolute inset-0 size-full object-cover object-top transition-opacity duration-300", state === "loaded" ? "opacity-100" : "opacity-0")}
        />
      )}
    </>
  );
}

/** Loads the template list and warms the first thumbnails while they edit, so Design opens ready. */
function usePreloadTemplates() {
  const templates = useCvTemplates();
  useEffect(() => {
    if (!templates.data) return;
    const t = setTimeout(() => {
      for (const tpl of templates.data.slice(0, 9)) {
        const img = new Image();
        img.decoding = "async";
        img.src = tpl.previewUrl;
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [templates.data]);
}
