"use client";

import { ChevronRight, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "./ui";

const HIDE_FOR_MS = 3 * 24 * 3_600_000;

/**
 * Slim call-to-action strip pinned to the top of a page (sticky: it takes its own space and
 * never covers content). Dismissable; it comes back after 3 days.
 */
export function PromoBanner({
  id,
  icon: Icon,
  children,
  action,
  onAction,
  className,
  dismissable = true,
}: {
  /** Remembers dismissal per banner (and per message, if the id includes it). */
  id: string;
  icon: LucideIcon;
  children: React.ReactNode;
  action: string;
  onAction: () => void;
  className?: string;
  dismissable?: boolean;
}) {
  const key = `banner:${id}`;
  const [hidden, setHidden] = useState(dismissable);
  useEffect(() => {
    if (!dismissable) return;
    try {
      const at = Number(localStorage.getItem(key) ?? 0);
      setHidden(Date.now() - at < HIDE_FOR_MS);
    } catch {
      setHidden(false);
    }
  }, [key, dismissable]);
  if (hidden) return null;

  return (
    <div
      className={cx(
        "flex items-center gap-2.5 border-b border-accent-border/70 bg-[linear-gradient(90deg,var(--accent-soft)_0%,#fffaf6_70%,#ffffff_100%)] px-4 py-2 animate-[fade-in_0.2s_ease-out]",
        className,
      )}
    >
      <Icon className="size-4 shrink-0 text-accent-strong" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{children}</p>
      <button type="button" onClick={onAction} className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-accent-strong">
        {action}
        <ChevronRight className="size-3.5" />
      </button>
      {dismissable && (
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(key, String(Date.now()));
          } catch {}
          setHidden(true);
        }}
        className="-mr-1 grid size-7 shrink-0 place-items-center rounded-full text-hint-light hover:bg-white/70 hover:text-hint"
      >
        <X className="size-3.5" />
      </button>
      )}
    </div>
  );
}
