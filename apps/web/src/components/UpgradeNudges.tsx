"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PLAN_NAME, type MeDto } from "@ethio/shared";
import { useSession } from "./miniapp/session";
import { usePaywall, type PaywallReason } from "./paywall";
import { formatDate } from "@/lib/plans";

/**
 * Upgrade pop-ups at chosen moments, instead of banners. At most one per app open,
 * a few seconds after a main tab settles, never during the first day, and never
 * while another sheet is open. Each opens the paywall sheet with its own headline.
 *
 * Free plan:
 *   - hit today's alert limit      → "Go unlimited"            once a day
 *   - premium jobs matched (7 days) → "N premium jobs matched" every 3 days
 *   (and 2 days of quiet after any upgrade pop-up)
 * Paid plan: only a renewal reminder, 3 days before it ends and on the last day.
 * Upselling Pro → Career happens only when they hit a CV limit (the normal paywall).
 * Beta (everyone Pro): nothing.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SHOW_ON = new Set(["/app", "/app/jobs", "/app/cvs"]);
const DELAY_MS = 3_000;
const QUIET_AFTER_ANY = 2 * DAY;
const FIRST_DAY = DAY;

interface Nudge {
  /** Remembered so it isn't shown again too soon. */
  key: string;
  every: number;
  /** Respect the shared quiet time after any other upgrade pop-up. */
  quiet: boolean;
  reason: PaywallReason;
  title: string;
  body: string;
  then?: string;
}

/** The pop-up this user should see now, by priority. Pure apart from the clock. */
export function pickNudge(me: MeDto, now: number): Nudge | null {
  if (me.beta) return null;

  if (me.plan !== "free" && me.planExpiresAt) {
    const left = new Date(me.planExpiresAt).getTime() - now;
    if (left <= 0 || left > 3 * DAY) return null;
    const lastDay = left <= DAY;
    return {
      key: `renew-${me.planExpiresAt}-${lastDay ? "1" : "3"}`,
      every: Infinity,
      quiet: false,
      reason: "renew",
      title: lastDay ? `Your ${PLAN_NAME[me.plan]} ends today` : `Your ${PLAN_NAME[me.plan]} ends on ${formatDate(me.planExpiresAt)}`,
      body: "Renew now to keep every alert and premium job coming. The new time is added to what you have left.",
    };
  }

  if (me.plan === "free" && me.effectivePlan === "free") {
    const cap = me.limits.dailyJobCap;
    if (cap !== null && me.stats.sentToday >= cap) {
      return {
        key: "daily-cap",
        every: 20 * HOUR,
        quiet: true,
        reason: "daily_cap",
        title: `You've had today's ${cap} alerts`,
        body: "More matching jobs are waiting. Pro sends every match the moment it's posted, with no daily limit.",
        then: "/app/jobs",
      };
    }
    const n = me.stats.lockedThisWeek;
    if (n > 0) {
      return {
        key: "premium",
        every: 3 * DAY,
        quiet: true,
        reason: "premium_job",
        title: `${n} premium ${n === 1 ? "job" : "jobs"} matched you this week`,
        body: "NGO, UN, AU, embassy, international company and overseas jobs. Unlock them and get every new one instantly.",
        then: "/app/jobs?scope=for_you",
      };
    }
  }
  return null;
}

const read = (k: string) => {
  try {
    return Number(localStorage.getItem(`nudge:${k}`) ?? 0);
  } catch {
    return 0;
  }
};
const write = (k: string, v: number) => {
  try {
    localStorage.setItem(`nudge:${k}`, String(v));
  } catch {}
};

let shownThisOpen = false;

export function UpgradeNudges() {
  const { me } = useSession();
  const { gate, isOpen } = usePaywall();
  const pathname = usePathname();

  useEffect(() => {
    if (!read("firstSeen")) write("firstSeen", Date.now());
  }, []);

  useEffect(() => {
    if (shownThisOpen || isOpen || !me.onboarded || !SHOW_ON.has(pathname)) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      if (now - read("firstSeen") < FIRST_DAY) return;
      const nudge = pickNudge(me, now);
      if (!nudge) return;
      if (now - read(nudge.key) < nudge.every) return;
      if (nudge.quiet && now - read("any") < QUIET_AFTER_ANY) return;
      if (!gate(nudge.reason, { title: nudge.title, body: nudge.body, then: nudge.then })) return;
      shownThisOpen = true;
      write(nudge.key, now);
      write("any", now);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [me, pathname, gate, isOpen]);

  return null;
}
