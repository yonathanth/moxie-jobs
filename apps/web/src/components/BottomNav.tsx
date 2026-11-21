"use client";

import clsx from "clsx";
import { Briefcase, FileText, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app/jobs", label: "Jobs", icon: Briefcase, match: (p: string) => p.startsWith("/app/jobs") },
  { href: "/app/cvs", label: "CVs", icon: FileText, match: (p: string) => p.startsWith("/app/cvs") },
  // Profile holds the account: plan, alerts, preferences, plans.
  { href: "/app", label: "Profile", icon: UserRound, match: (p: string) => p === "/app" || p.startsWith("/app/plans") || p.startsWith("/app/preferences") },
] as const;

/** Main sections of the Mini App. Shown on top-level pages only (not editors or detail pages). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-separator bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
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
    </nav>
  );
}
