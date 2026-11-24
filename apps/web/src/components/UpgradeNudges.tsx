"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PLAN_NAME, type MeDto } from "@ethio/shared";
import { useSession } from "./miniapp/session";
import { usePaywall, type PaywallReason } from "./paywall";
import { formatDate } from "@/lib/plans";

/**
 * Upgrade pop-ups at chosen moments, instead of banners: at most one per app
 * open, 5 seconds after a main tab (Jobs, CV, Profile) loads, at least 8 hours
 * apart, never in the first day or while another sheet is open. Each opens the
 * paywall sheet with its own headline.
 *
 * Free plan, by what's true for them:
 *   1. hit today's alert limit      → "4 more jobs are waiting"
 *   2. premium jobs matched (7 days) → "3 premium jobs matched you this week"
 *   3. otherwise the general Pro pitch and the CV pitch take turns
 * Paid plan: only a renewal reminder, 3 days before it ends and on the last day.
 * Beta (everyone Pro): nothing.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SHOW_ON = new Set(["/app", "/app/jobs", "/app/cvs"]);
const DELAY_MS = 5_000;
/** Free-plan pop-ups are at least this far apart. */
const QUIET_AFTER_ANY = 8 * HOUR;
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
      const w = me.stats.waitingToday;
      return {
        key: "daily-cap",
        every: 20 * HOUR,
        quiet: true,
        reason: "daily_cap",
        title: w > 0 ? `${w} more ${w === 1 ? "job is" : "jobs are"} waiting for you` : `You've had today's ${cap} alerts`,
        body: "You've reached today's free limit. Pro sends every match the moment it's posted, with no daily limit.",
        then: "/app/jobs?scope=for_you",
      };
    }
    const locked = me.stats.lockedThisWeek;
    if (locked > 0 && (now - read("premium")) >= 3 * DAY) {
      return {
        key: "premium",
        every: 3 * DAY,
        quiet: true,
        reason: "premium_job",
        title: `${locked} premium ${locked === 1 ? "job" : "jobs"} matched you this week`,
        body: "NGO, UN, AU, embassy, international company and overseas jobs. Unlock them and get every new one instantly.",
        then: "/app/jobs?scope=for_you",
      };
    }
    // Nothing specific: the Pro pitch and the CV pitch take turns.
    const cvNext = read("pitch-pro") > read("pitch-cv");
    return cvNext
      ? {
          key: "pitch-cv",
          every: 0,
          quiet: true,
          reason: "cvs",
          title: "A CV made for every job you apply to",
          body: "Pro makes new CVs and tailors them to jobs every month, with AI polish.",
        }
      : {
          key: "pitch-pro",
          every: 0,
          quiet: true,
          reason: "daily_cap",
          title: "Get every job that fits you, the moment it's posted",
          body: "Pro has no daily alert limit and adds NGO, UN, embassy and jobs abroad.",
        };
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
      // Local dev view (/app?as=free): show on every load so it can be checked.
      const dev = process.env.NODE_ENV !== "production" && (() => {
        try {
          return !!sessionStorage.getItem("dev:as");
        } catch {
          return false;
        }
      })();
      if (!dev && now - read("firstSeen") < FIRST_DAY) return;
      const nudge = pickNudge(me, now);
      if (!nudge) return;
      if (!dev && now - read(nudge.key) < nudge.every) return;
      if (!dev && nudge.quiet && now - read("any") < QUIET_AFTER_ANY) return;
      if (!gate(nudge.reason, { title: nudge.title, body: nudge.body, then: nudge.then })) return;
      shownThisOpen = true;
      write(nudge.key, now);
      write("any", now);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [me, pathname, gate, isOpen]);

  return null;
}
