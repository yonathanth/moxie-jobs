"use client";

import clsx from "clsx";
import { Briefcase, Crown, UserRound } from "lucide-react";
import { PaperIcon } from "./PaperIcon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "./miniapp/session";

const ITEMS = [
  { href: "/app/jobs", label: "Jobs", icon: Briefcase, match: (p: string) => p.startsWith("/app/jobs") },
  { href: "/app/cvs", label: "CV", icon: PaperIcon, match: (p: string) => p.startsWith("/app/cvs") },
  { href: "/app/plans", label: "Plans", icon: Crown, match: (p: string) => p.startsWith("/app/plans") },
  // Profile holds the account: plan, alerts, preferences.
  { href: "/app", label: "Profile", icon: UserRound, match: (p: string) => p === "/app" || p.startsWith("/app/preferences") },
] as const;

/** Top-level pages show the bar; editors, detail pages, onboarding and admin don't. */
const SHOWN_ON = new Set(["/app", "/app/jobs", "/app/cvs", "/app/plans"]);

/**
 * Main sections of the Mini App, rendered once by the Mini App shell.
 * Portalled to <body> so no page wrapper (a transform, filter or animation) can ever
 * turn `position: fixed` into "scrolls with the page".
 */
export function BottomNav() {
  const path = usePathname().replace(/\/$/, "") || "/";
  const { me } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !me.onboarded || !SHOWN_ON.has(path)) return null;

  return createPortal(
    // A floating dock: the current tab is a dark pill with its name; the others are just their icon.
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
      <ul className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-1 rounded-full border border-separator bg-surface/95 p-1.5 shadow-[0_16px_40px_-14px_rgba(15,17,21,0.35)] backdrop-blur">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className={active ? "shrink-0" : "flex-1"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={clsx(
                  "flex h-12 items-center justify-center gap-2 rounded-full transition-all duration-200",
                  active ? "bg-ink px-5 text-white shadow-[0_6px_16px_-8px_rgba(15,17,21,0.6)]" : "text-hint hover:bg-pill hover:text-text active:bg-pill",
                )}
              >
                <Icon className="size-[22px] shrink-0" strokeWidth={active ? 2.3 : 2} />
                {active && <span className="text-[14px] font-semibold">{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>,
    document.body,
  );
}
