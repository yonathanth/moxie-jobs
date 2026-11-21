"use client";

import { ArrowRight, Briefcase, Building2, Infinity as InfinityIcon, Layers, MapPin, X, type LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_PLAN_LIMITS, PAID_PLANS, PLAN_NAME, type PaidPlan, type PlanLimits } from "@ethio/shared";
import { usePricing } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { formatBirr } from "@/lib/plans";
import { haptic } from "@/lib/telegram";
import { Button, IconTile } from "./ui";

/**
 * Paywalls: shown the moment a user tries something their plan doesn't allow
 * (one more profession, a whole category, a locked job...). Pickers call
 * `paywall.gate(reason)`: it opens the sheet when a paid plan lifts the limit
 * and returns true; false means no plan allows more (just the normal max).
 */

export type PaywallReason = "professions" | "categories" | "fields" | "locations" | "premium_job" | "daily_cap";

const LIMIT_KEY: Partial<Record<PaywallReason, keyof PlanLimits>> = {
  professions: "maxProfessions",
  categories: "maxFunctions",
  fields: "maxFieldsOfStudy",
  locations: "maxLocations",
};

const COPY: Record<PaywallReason, { icon: LucideIcon; title: string; body: (cur: PlanLimits, next: PlanLimits, plan: PaidPlan) => string }> = {
  professions: {
    icon: Briefcase,
    title: "Follow more professions",
    body: (cur, next, plan) => `Your plan includes ${cur.maxProfessions}. ${PLAN_NAME[plan]} follows up to ${next.maxProfessions}, so you never miss a related role.`,
  },
  categories: {
    icon: Layers,
    title: "Follow a whole category",
    body: (cur, next, plan) =>
      cur.maxFunctions === 0
        ? `Get every job in a category, like all Accounting & Finance roles. ${PLAN_NAME[plan]} includes ${next.maxFunctions}.`
        : `Your plan includes ${cur.maxFunctions}. ${PLAN_NAME[plan]} includes ${next.maxFunctions}.`,
  },
  fields: {
    icon: Layers,
    title: "Add more fields of study",
    body: (cur, next, plan) => `Your plan includes ${cur.maxFieldsOfStudy}. ${PLAN_NAME[plan]} includes up to ${next.maxFieldsOfStudy}.`,
  },
  locations: {
    icon: MapPin,
    title: "Add more cities",
    body: (cur, next, plan) => `Your plan includes ${cur.maxLocations}. ${PLAN_NAME[plan]} includes up to ${next.maxLocations}.`,
  },
  premium_job: {
    icon: Building2,
    title: "This job is in Pro",
    body: () => "NGO, UN, AU, embassy, international company and overseas jobs come with Pro and Career, sent the moment they're posted.",
  },
  daily_cap: {
    icon: InfinityIcon,
    title: "Go unlimited",
    body: (cur) => `The free plan sends ${cur.dailyJobCap ?? 10} alerts a day. Pro sends every match instantly, with no limit.`,
  },
};

interface Paywall {
  /** Opens the paywall if a paid plan lifts this limit. Returns whether it opened. */
  gate: (reason: PaywallReason) => boolean;
}

const PaywallContext = createContext<Paywall | null>(null);

export function usePaywall(): Paywall {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error("usePaywall must be used inside <PaywallProvider>");
  return ctx;
}

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const pricing = usePricing();
  const [open, setOpen] = useState<{ reason: PaywallReason; plan: PaidPlan } | null>(null);

  const planLimits = useCallback((p: PaidPlan) => pricing.data?.limits[p] ?? DEFAULT_PLAN_LIMITS[p], [pricing.data]);

  const gate = useCallback(
    (reason: PaywallReason) => {
      const key = LIMIT_KEY[reason];
      // The cheapest paid plan that allows more than the current limit.
      const plan = PAID_PLANS.find((p) => {
        const next = planLimits(p);
        if (reason === "premium_job") return next.premiumJobs && !me.limits.premiumJobs;
        if (reason === "daily_cap") return next.dailyJobCap === null && me.limits.dailyJobCap !== null;
        return key ? (next[key] as number) > (me.limits[key] as number) : false;
      });
      if (!plan) return false;
      haptic.error();
      setOpen({ reason, plan });
      return true;
    },
    [me.limits, planLimits],
  );

  return (
    <PaywallContext.Provider value={{ gate }}>
      {children}
      {open && (
        <PaywallSheet
          reason={open.reason}
          plan={open.plan}
          current={me.limits}
          next={planLimits(open.plan)}
          fromPrice={pricing.data?.prices[open.plan].week ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </PaywallContext.Provider>
  );
}

function PaywallSheet({
  reason,
  plan,
  current,
  next,
  fromPrice,
  onClose,
}: {
  reason: PaywallReason;
  plan: PaidPlan;
  current: PlanLimits;
  next: PlanLimits;
  fromPrice: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const onboarding = usePathname().startsWith("/app/onboarding");
  const copy = COPY[reason];
  const Icon = copy.icon;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-fade-up" />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-[0_-12px_40px_-12px_rgba(15,17,21,0.3)] animate-fade-up">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-pill text-hint">
          <X className="size-4" />
        </button>
        <IconTile>
          <Icon className="size-5" />
        </IconTile>
        <h2 id="paywall-title" className="mt-4 text-xl font-bold tracking-tight">
          {copy.title}
        </h2>
        <p className="mt-1.5 text-[15px] text-hint">{copy.body(current, next, plan)}</p>
        {fromPrice !== null && (
          <p className="mt-3 text-sm font-semibold text-accent-strong">
            {PLAN_NAME[plan]} from {formatBirr(fromPrice)} a week
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {onboarding ? (
            <>
              <p className="rounded-xl bg-pill px-3 py-2 text-[13px] text-hint">You can upgrade right after setup, from the Plans page.</p>
              <Button onClick={onClose}>Got it</Button>
            </>
          ) : (
            <>
              <Button
                variant="accent"
                onClick={() => {
                  onClose();
                  router.push("/app/plans");
                }}
              >
                See plans
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Not now
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
