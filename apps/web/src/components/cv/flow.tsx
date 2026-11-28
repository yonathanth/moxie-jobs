"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CvQuotaDto } from "@ethio/shared";
import { PackCards } from "./PackCards";
import { usePackCheckout } from "./hooks";
import { usePayment, usePricing } from "../miniapp/hooks";
import { useSession } from "../miniapp/session";
import { MoxieLoader } from "../moxie";
import { usePaywall } from "../paywall";
import { Button, CenteredMessage, ErrorText, IconTile, Sheet, Skeleton } from "../ui";
import { formatBirr } from "@/lib/plans";
import { getWebApp, haptic } from "@/lib/telegram";

/** Shared by the CV flows: the new-CV modal (CV tab) and the tailor page (from a job). */

export type Mode = "create" | "improve" | "tailor";

/** Moxie at work while the AI writes, improves or tailors the CV (as on gomoxie.app). `done`: she celebrates before the CV opens. */
export function Working({ phase, flow, jobTitle, done = false }: { phase: "base" | "tailor"; flow: Mode; jobTitle?: string; done?: boolean }) {
  const { me } = useSession();
  const crowned = me.plan !== "free";
  const end = { done, doneMessage: phase === "tailor" ? "Your tailored CV is ready!" : "Your CV is ready!" };
  if (phase === "tailor") {
    return (
      <MoxieLoader
        animation="tailor"
        crowned={crowned}
        {...end}
        messages={[jobTitle ? `Tailoring your CV to ${jobTitle}…` : "Reading the job post…", "Matching your experience to it…", "Cutting what doesn't fit…", "Keeping it all true to you…"]}
      />
    );
  }
  if (flow === "improve") {
    return <MoxieLoader animation="polish" crowned={crowned} {...end} messages={["Improving your CV…", "Tightening every bullet…", "Bringing your results forward…", "Cutting the filler…"]} />;
  }
  return <MoxieLoader animation="write" crowned={crowned} {...end} messages={["Writing your CV…", "Choosing strong action verbs…", "Turning duties into results…", "Laying it out cleanly…"]} />;
}

/** Moxie works on screen at least this long, even when the AI is faster (as on gomoxie.app). */
export const MIN_WORKING_MS = 3000;
/** Then she celebrates this long before the CV opens. */
export const DONE_MS = 1300;

/**
 * Keeps Moxie on screen from the moment the work starts until the next page has taken over, so the
 * form never flashes back in between (the request finishing ≠ the navigation finishing).
 *   start() when the work begins · stop() on an error, mismatch or paywall · finish(go) on success:
 *   waits out MIN_WORKING_MS, shows "done" for DONE_MS, then calls go() and stays up until unmount.
 */
export function useWorkingHold() {
  const startedAt = useRef(0);
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const start = useCallback(() => {
    if (!startedAt.current) startedAt.current = Date.now();
    setDone(false);
    setActive(true);
  }, []);
  const stop = useCallback(() => {
    startedAt.current = 0;
    setDone(false);
    setActive(false);
  }, []);
  const finish = useCallback(async (go: () => void) => {
    setActive(true);
    const left = MIN_WORKING_MS - (Date.now() - (startedAt.current || Date.now()));
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    setDone(true);
    await new Promise((r) => setTimeout(r, DONE_MS));
    go();
  }, []);
  return { active, done, start, stop, finish };
}


export function openCheckout(url: string) {
  const wa = getWebApp();
  if (wa) wa.openLink(url);
  else window.open(url, "_blank", "noopener");
}

/** Out of CVs: pick a pack. After paying, the CV they were making is made straight away. */
export function PackPrompt({ message, onClose, onCheckout }: { message: string; onClose: () => void; onCheckout: (p: { id: string; url: string }) => void }) {
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
export function PackWaiting({ payment, onPaid, onCancel }: { payment: { id: string; url: string }; onPaid: () => void; onCancel: () => void }) {
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

/** Minimum text for the AI to work with (the API refuses less). */
export const MIN_SOURCE_CHARS = 40;

/**
 * Under a CV text box: why the button is still off, and how close they are.
 * A thin bar fills as they type; once there's enough it says so.
 */
export function MinLengthHint({ length, min = MIN_SOURCE_CHARS, what = "write a bit more" }: { length: number; min?: number; what?: string }) {
  const ready = length >= min;
  const pct = Math.min(100, Math.round((length / min) * 100));
  return (
    <div className="mt-2 px-1" aria-live="polite">
      <div className="h-1 overflow-hidden rounded-full bg-separator">
        <div className={`h-full rounded-full transition-[width,background-color] duration-300 ${ready ? "bg-emerald" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1.5 text-[12px] ${ready ? "text-emerald" : "text-hint"}`}>
        {ready ? "Enough to start. More details make a better CV." : length === 0 ? `To continue, ${what}.` : "A little more to continue."}
      </p>
    </div>
  );
}
