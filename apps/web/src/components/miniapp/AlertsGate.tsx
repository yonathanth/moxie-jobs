"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, ErrorText, IconTile } from "@/components/ui";
import { api } from "@/lib/api";
import { BOT_URL } from "@/lib/config";
import { canRequestMessages, getWebApp, haptic, messagesAllowedAtLaunch, openExternal, requestMessages } from "@/lib/telegram";
import { useSession } from "./session";

const KEY = ["messaging"] as const;

/**
 * Can the bot message this person? "ok" outside Telegram (local dev), when Telegram's launch data says so,
 * or when the API's check succeeds (or can't tell). "needed" = every alert would fail until they allow it.
 */
export function useMessagingStatus(): { status: "checking" | "ok" | "needed"; markAllowed: () => void } {
  const { token } = useSession();
  const qc = useQueryClient();
  const inTelegram = !!getWebApp();
  const known = !inTelegram || messagesAllowedAtLaunch();
  const check = useQuery({ queryKey: KEY, queryFn: () => api.messaging(token), enabled: !known, staleTime: Infinity, retry: 1 });
  const markAllowed = () => qc.setQueryData(KEY, { canMessage: true });
  if (known) return { status: "ok", markAllowed };
  if (check.isPending) return { status: "checking", markAllowed };
  // An error or "can't tell" never locks anyone out.
  return { status: check.data?.canMessage === false ? "needed" : "ok", markAllowed };
}

/**
 * The required step: job alerts are Telegram messages, so they must let the bot message them. No way past it
 * except allowing (Telegram's own prompt; on old Telegram apps, pressing Start in the bot chat).
 */
export function AlertsPrompt({ onAllowed }: { onAllowed: () => void }) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const canPrompt = canRequestMessages();

  const allowed = async () => {
    haptic.success();
    // Tells the API so anything held back gets sent; never blocks them if that call fails.
    await api.messagingAllowed(token).catch(() => undefined);
    onAllowed();
  };

  const allow = async () => {
    setBusy(true);
    setDeclined(false);
    const granted = await requestMessages();
    setBusy(false);
    if (granted) return void allowed();
    haptic.error();
    setDeclined(true);
  };

  // Older Telegram apps: Start in the bot chat does the same.
  const checkAgain = async () => {
    setBusy(true);
    setNotYet(false);
    const r = await api.messaging(token).catch(() => ({ canMessage: null }));
    setBusy(false);
    if (r.canMessage !== false) return void allowed();
    haptic.error();
    setNotYet(true);
  };

  return (
    <Dialog
      labelId="alerts-gate-title"
      icon={
        <IconTile tone="accent">
          <BellRing className="size-5" />
        </IconTile>
      }
      title="Turn on job alerts"
      body={
        <>
          <p>We send every matching job to you as a Telegram message from our bot.</p>
          <p className="mt-2 font-medium text-text">
            {canPrompt ? "Tap Allow messages, then choose Allow. Without it you won't get any job alerts." : "Open the bot and press Start. Without it you won't get any job alerts."}
          </p>
        </>
      }
    >
      {declined && <ErrorText>Job alerts are still off. Tap Allow messages and choose Allow to get them.</ErrorText>}
      {notYet && <ErrorText>Not on yet. Open the bot, press Start, then come back and tap the button below.</ErrorText>}
      {canPrompt ? (
        <Button variant="accent" loading={busy} onClick={() => void allow()}>
          <BellRing className="size-4" />
          Allow messages
        </Button>
      ) : (
        <>
          <Button variant="accent" onClick={() => openExternal(`${BOT_URL}?start=alerts`)}>
            <MessageCircle className="size-4" />
            Open the bot and press Start
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => void checkAgain()}>
            I pressed Start
          </Button>
        </>
      )}
    </Dialog>
  );
}

/**
 * For people already set up (e.g. they set up from a link and never allowed messages): the app stays behind
 * the prompt until alerts can reach them. Onboarding asks on its own, before saving.
 */
export function AlertsGate() {
  const { me } = useSession();
  const pathname = usePathname();
  const onboarding = pathname?.startsWith("/app/onboarding");
  if (!me.onboarded || onboarding) return null;
  return <AlertsGateInner />;
}

function AlertsGateInner() {
  const { status, markAllowed } = useMessagingStatus();
  if (status !== "needed") return null;
  return <AlertsPrompt onAllowed={markAllowed} />;
}
