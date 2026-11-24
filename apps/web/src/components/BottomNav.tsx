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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-separator bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors",
                  active ? "text-text" : "text-hint-light hover:text-hint",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>,
    document.body,
  );
}
