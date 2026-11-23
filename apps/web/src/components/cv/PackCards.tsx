"use client";

import clsx from "clsx";
import { FilePlus2, Loader2, Target } from "lucide-react";
import type { CvPackDto, CvPackId } from "@ethio/shared";
import { formatBirr } from "@/lib/plans";

/** Soft tints per pack, like the plan cards. */
const TINT: Record<CvPackId, string> = {
  cv_pack_s: "border-emerald-200 bg-[linear-gradient(135deg,#e9f8f1_0%,#f5fcf8_45%,#ffffff_100%)]",
  cv_pack_m: "border-accent-border bg-[linear-gradient(135deg,#fff1e8_0%,#fff8f3_45%,#ffffff_100%)]",
  cv_pack_l: "border-violet-200 bg-[linear-gradient(135deg,#f1edfd_0%,#f8f6fe_45%,#ffffff_100%)]",
};

/** CV packs: credits that never expire. Tap a pack to buy it. */
export function PackCards({ packs, busyId, disabled, onBuy }: { packs: CvPackDto[]; busyId?: CvPackId | null; disabled?: boolean; onBuy: (id: CvPackId) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {packs.map((p) => {
        const popular = p.id === "cv_pack_m";
        const busy = busyId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onBuy(p.id)}
            className={clsx(
              "relative flex w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-[0_12px_32px_-26px_rgba(15,17,21,0.35)] transition-transform active:scale-[0.99] disabled:opacity-70",
              TINT[p.id],
            )}
          >
            {popular && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Best value</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold tracking-tight">{p.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-hint">
                <span className="inline-flex items-center gap-1">
                  <FilePlus2 className="size-3.5" />
                  {p.newCvs} new or improved
                </span>
                <span className="inline-flex items-center gap-1">
                  <Target className="size-3.5" />
                  {p.tailored} tailored
                </span>
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-[14px] font-semibold text-white">
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {formatBirr(p.price)}
            </span>
          </button>
        );
      })}
      <p className="px-1 text-center text-[12px] text-hint">Credits never expire. Use them anytime, on top of your plan.</p>
    </div>
  );
}
