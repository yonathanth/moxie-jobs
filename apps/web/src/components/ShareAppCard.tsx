"use client";

import { Building2, ChevronRight, FilePlus2, Megaphone, Search, Send, Upload, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { ShareAppKind } from "@ethio/shared";
import { useSession } from "./miniapp/session";
import { Card, IconTile, Sheet, Toast, useToast, type IconTone } from "./ui";
import { shareApp } from "@/lib/share";
import { haptic } from "@/lib/telegram";

/**
 * Profile → "Share Meklit Jobs": pick what the share is about, so it lands with
 * the right person. Each sends a picture message whose button opens that place
 * in the Mini App (see SHARE_APP_MESSAGES / START_APP_ROUTES in @ethio/shared).
 */

const OPTIONS: { kind: ShareAppKind; icon: LucideIcon; tone: IconTone; title: string; body: string }[] = [
  { kind: "general", icon: Megaphone, tone: "accent", title: "Meklit Jobs in general", body: "Jobs that fit you, plus a CV for every job" },
  { kind: "jobs", icon: Search, tone: "sky", title: "Find jobs that fit you", body: "For someone looking for work" },
  { kind: "cv_create", icon: FilePlus2, tone: "emerald", title: "Create a CV", body: "For someone without a CV yet" },
  { kind: "cv_improve", icon: Upload, tone: "violet", title: "Improve a CV", body: "For someone whose CV needs work" },
  { kind: "premium", icon: Building2, tone: "neutral", title: "NGO, UN, embassy and international jobs", body: "For someone aiming for those" },
];

export function ShareAppCard() {
  const { token } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ShareAppKind | null>(null);
  const [toast, showToast] = useToast();

  const share = async (kind: ShareAppKind) => {
    haptic.select();
    setBusy(kind);
    const res = await shareApp(kind, token);
    setBusy(null);
    setOpen(false);
    if (res === "copied") showToast("Link copied");
    else if (res === "failed") showToast("Couldn't share. Try again.", "error");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-5 block w-full text-left">
        <Card className="flex items-center gap-3 transition-colors active:bg-neutral-50">
          <IconTile tone="accent">
            <Send className="size-5" />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Share Meklit Jobs</p>
            <p className="text-[13px] text-hint">Help a friend find a job or make a CV</p>
          </div>
          <ChevronRight className="size-4 text-hint-light" />
        </Card>
      </button>

      {open && (
        <Sheet title="What do you want to share?" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-2 pb-1">
            {OPTIONS.map((o) => (
              <button
                key={o.kind}
                type="button"
                disabled={busy !== null}
                onClick={() => void share(o.kind)}
                className="flex w-full items-center gap-3 rounded-2xl border border-separator bg-surface p-3.5 text-left transition-colors active:bg-neutral-50 disabled:opacity-60"
              >
                <IconTile tone={o.tone}>
                  <o.icon className="size-5" />
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{o.title}</span>
                  <span className="block text-[12px] text-hint">{o.body}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-hint-light" />
              </button>
            ))}
          </div>
        </Sheet>
      )}
      <Toast message={toast.message} tone={toast.tone} />
    </>
  );
}
