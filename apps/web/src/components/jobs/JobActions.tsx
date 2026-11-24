"use client";

import { cx } from "../ui";
import { Bookmark, Check, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { JobCardDto } from "@ethio/shared";
import { useToggleSaved } from "../miniapp/hooks";
import { useSession } from "../miniapp/session";
import { haptic } from "@/lib/telegram";
import { shareJob } from "@/lib/share";

type Variant = "bar" | "pill";

const base: Record<Variant, string> = {
  // Inside a job card's footer: quiet text buttons.
  bar: "h-9 gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-hint hover:bg-neutral-50 hover:text-text active:bg-neutral-100",
  // On the job page: outlined pills.
  pill: "h-9 gap-1.5 rounded-full border border-separator bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-neutral-50 active:bg-neutral-100",
};

export function SaveButton({ job, variant = "bar" }: { job: Pick<JobCardDto, "id" | "saved">; variant?: Variant }) {
  const toggle = useToggleSaved();
  const saved = job.saved;
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => {
        haptic.select();
        toggle.mutate({ id: job.id, saved: !saved });
      }}
      className={cx(
        "inline-flex items-center transition-colors",
        base[variant],
        saved && (variant === "pill" ? "border-accent-border bg-accent-soft text-accent-strong hover:bg-accent-soft" : "text-accent-strong hover:text-accent-strong"),
      )}
    >
      <Bookmark className={cx("size-4 transition-transform", saved && "scale-110 fill-current")} />
      {saved ? "Saved" : "Save"}
    </button>
  );
}

export function ShareButton({
  job,
  variant = "bar",
}: {
  job: Pick<JobCardDto, "id" | "title" | "company" | "employerLabel" | "premium" | "location" | "deadline">;
  variant?: Variant;
}) {
  const { token } = useSession();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        haptic.select();
        const res = await shareJob(job, token);
        if (res === "copied") {
          haptic.success();
          setCopied(true);
        }
      }}
      className={cx("inline-flex items-center transition-colors", base[variant], copied && "text-emerald-600")}
    >
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
