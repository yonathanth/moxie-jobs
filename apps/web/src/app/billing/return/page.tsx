import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { BOT_URL } from "@/lib/config";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

/**
 * Where SantimPay sends the browser after checkout. This runs outside Telegram
 * (no session), so it only tells the user what happens next; the payment is
 * confirmed server-side (webhook + status API) and the Mini App picks it up.
 */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  const ok = result === "success";
  const cancelled = result === "cancel";

  return (
    <main className="bg-grid-pattern flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-separator bg-surface p-6 text-center shadow-[0_18px_44px_-26px_rgba(15,17,21,0.35)]">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-pill">
          {ok ? (
            <CheckCircle2 className="size-6 text-emerald" />
          ) : cancelled ? (
            <Clock className="size-6 text-hint" />
          ) : (
            <XCircle className="size-6 text-danger" />
          )}
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight">
          {ok ? "Payment received" : cancelled ? "Payment cancelled" : "Payment didn't go through"}
        </h1>
        <p className="mt-2 text-[15px] text-hint">
          {ok
            ? "We're confirming it now. You'll get a message from the bot in a moment."
            : "No money was taken. Go back to Telegram to try again."}
        </p>
        <a
          href={BOT_URL}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-ink px-5 text-[15px] font-semibold text-white"
        >
          Back to Telegram
        </a>
      </div>
    </main>
  );
}
