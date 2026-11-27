"use client";

import clsx from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  FileText,
  Infinity as InfinityIcon,
  Layers,
  MapPin,
  ShieldCheck,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_PLAN_LIMITS,
  PAID_PLANS,
  PERIOD_LABEL,
  PLAN_NAME,
  SOLD_PERIODS,
  type MeDto,
  type PaidPlan,
  type PlanLimits,
  type PricingDto,
} from "@ethio/shared";
import { useCheckout, usePayment, usePricing, useRefreshMe } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { formatBirr, paywallTagline, planBenefits, savingVsMonthly } from "@/lib/plans";
import { getWebApp, haptic } from "@/lib/telegram";
import { Portal } from "./Portal";
import { Button, ErrorText, IconTile, Spinner } from "./ui";

/**
 * Paywalls: shown the moment a user tries something their plan doesn't allow
 * (one more profession, a whole category, a locked job, AI CV fixes...).
 * `paywall.gate(reason)` opens one sheet that sells the plans lifting that
 * limit: pick Pro or Career, pick monthly or 3 months, pay in SantimPay, and
 * once it's confirmed the sheet closes where the user was (or goes to
 * `then`), with the new plan already applied. Returns false when no plan
 * allows more (just the normal max).
 */

export type PaywallReason = "professions" | "categories" | "fields" | "locations" | "premium_job" | "daily_cap" | "cv_ai" | "cvs" | "renew";
type Period = (typeof SOLD_PERIODS)[number];

/** Hosted checkout must open outside the Mini App webview. */
export function openCheckout(url: string) {
  const wa = getWebApp();
  if (wa) wa.openLink(url);
  else window.open(url, "_blank", "noopener");
}

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
    title: "Follow more categories",
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
    title: "Unlock NGO, embassy & international jobs",
    body: () => "NGO, UN, AU, embassy, international company and overseas jobs, sent the moment they're posted.",
  },
  daily_cap: {
    icon: InfinityIcon,
    title: "Go unlimited",
    body: (cur) => `The free plan sends ${cur.dailyJobCap ?? 5} jobs a day in full. Jobs over the limit open free the next day; Pro and Career send every match instantly, with no limit.`,
  },
  cv_ai: {
    icon: FileText,
    title: "Get every CV fix",
    body: () => "See the full breakdown, get an AI check and let AI polish your CV in one tap. Plus new and tailored CVs every month.",
  },
  renew: {
    icon: Clock,
    title: "Keep your plan",
    body: (_cur, _next, plan) => `Renew ${PLAN_NAME[plan]} and the new time is added to what you have left.`,
  },
  cvs: {
    icon: FileText,
    title: "Get CVs every month",
    body: (_cur, next, plan) =>
      `${PLAN_NAME[plan]} includes ${perMonth(next.cvNewPerMonth, "new or improved CV")} and ${perMonth(next.cvTailorPerMonth, "tailored CV")} a month, plus AI polish.`,
  },
};

function perMonth(n: number | null, what: string): string {
  return n === null ? `unlimited ${what}s` : `${n} ${what}${n === 1 ? "" : "s"}`;
}

/** More of this monthly CV allowance than the user has now (null = unlimited). */
function moreCvs(next: number | null, cur: number | null): boolean {
  return cur !== null && (next === null || next > cur);
}

/** The paid plans that lift this limit for this user. */
function plansFor(reason: PaywallReason, me: MeDto, limitsOf: (p: PaidPlan) => PlanLimits): PaidPlan[] {
  const key = LIMIT_KEY[reason];
  return PAID_PLANS.filter((p) => {
    const next = limitsOf(p);
    if (reason === "premium_job") return next.premiumJobs && !me.limits.premiumJobs;
    if (reason === "daily_cap") return next.dailyJobCap === null && me.limits.dailyJobCap !== null;
    if (reason === "renew") return p === me.plan;
    if (reason === "cv_ai") return me.effectivePlan === "free";
    if (reason === "cvs") return moreCvs(next.cvNewPerMonth, me.limits.cvNewPerMonth) || moreCvs(next.cvTailorPerMonth, me.limits.cvTailorPerMonth);
    return key ? (next[key] as number) > (me.limits[key] as number) : false;
  });
}

interface GateOptions {
  /** Where to go once the payment is confirmed (default: stay where the user is). */
  then?: string;
  /** Headline and text in place of the reason's own (used by the upgrade nudges). */
  title?: string;
  body?: string;
}

interface Paywall {
  /** Opens the paywall if a paid plan lifts this limit. Returns whether it opened. */
  gate: (reason: PaywallReason, options?: GateOptions) => boolean;
  isOpen: boolean;
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
  const [open, setOpen] = useState<{ reason: PaywallReason; plans: PaidPlan[]; options?: GateOptions } | null>(null);

  const limitsOf = useCallback((p: PaidPlan) => pricing.data?.limits[p] ?? DEFAULT_PLAN_LIMITS[p], [pricing.data]);

  const gate = useCallback(
    (reason: PaywallReason, options?: GateOptions) => {
      const plans = plansFor(reason, me, limitsOf);
      if (plans.length === 0) return false;
      haptic.error();
      setOpen({ reason, plans, options });
      return true;
    },
    [me, limitsOf],
  );

  return (
    <PaywallContext.Provider value={{ gate, isOpen: open !== null }}>
      {children}
      {open && (
        <PaywallSheet
          reason={open.reason}
          plans={open.plans}
          then={open.options?.then}
          title={open.options?.title}
          body={open.options?.body}
          me={me}
          limitsOf={limitsOf}
          pricing={pricing.data ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </PaywallContext.Provider>
  );
}

type Step = { kind: "plans" } | { kind: "period"; plan: PaidPlan } | { kind: "paying"; plan: PaidPlan; period: Period; paymentId: string; url: string };

function PaywallSheet({
  reason,
  plans,
  then,
  title,
  body,
  me,
  limitsOf,
  pricing,
  onClose,
}: {
  reason: PaywallReason;
  plans: PaidPlan[];
  then?: string;
  title?: string;
  body?: string;
  me: MeDto;
  limitsOf: (p: PaidPlan) => PlanLimits;
  pricing: PricingDto | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "plans" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-[fade-in_0.2s_ease-out]" />
        <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-[0_-12px_40px_-12px_rgba(15,17,21,0.3)] animate-[sheet-up_0.24s_ease-out]">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-pill text-hint">
            <X className="size-4" />
          </button>
          {step.kind === "plans" && (
            <PlansStep
              reason={reason}
              title={title}
              body={body}
              plans={plans}
              me={me}
              limitsOf={limitsOf}
              pricing={pricing}
              onPick={(plan) => {
                haptic.select();
                setStep({ kind: "period", plan });
              }}
            />
          )}
          {step.kind === "period" && pricing && (
            <PeriodStep
              plan={step.plan}
              limits={limitsOf(step.plan)}
              pricing={pricing}
              onBack={() => setStep({ kind: "plans" })}
              onStarted={(period, paymentId, url) => setStep({ kind: "paying", plan: step.plan, period, paymentId, url })}
            />
          )}
          {step.kind === "paying" && (
            <PayingStep
              plan={step.plan}
              paymentId={step.paymentId}
              url={step.url}
              then={then}
              onRetry={() => setStep({ kind: "period", plan: step.plan })}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </Portal>
  );
}

/** Soft tints per plan, as on the Plans page. */
const PLAN_STYLE: Record<PaidPlan, { card: string; crown: string }> = {
  pro: { card: "border-accent-border bg-[linear-gradient(135deg,#fff1e8_0%,#fff8f3_45%,#ffffff_100%)]", crown: "text-accent" },
  career: { card: "border-sky-200 bg-[linear-gradient(135deg,#e6f4fb_0%,#f3f9fd_45%,#ffffff_100%)]", crown: "text-sky-600" },
};

function PlansStep({
  reason,
  title,
  body,
  plans,
  me,
  limitsOf,
  pricing,
  onPick,
}: {
  reason: PaywallReason;
  title?: string;
  body?: string;
  plans: PaidPlan[];
  me: MeDto;
  limitsOf: (p: PaidPlan) => PlanLimits;
  pricing: PricingDto | null;
  onPick: (plan: PaidPlan) => void;
}) {
  const copy = COPY[reason];
  const Icon = copy.icon;
  return (
    <>
      <IconTile>
        <Icon className="size-5" />
      </IconTile>
      <h2 id="paywall-title" className="mt-4 pr-8 text-xl font-bold tracking-tight">
        {title ?? copy.title}
      </h2>
      <p className="mt-1.5 text-[15px] text-hint">{body ?? copy.body(me.limits, limitsOf(plans[0]), plans[0])}</p>

      <div className="mt-5 flex flex-col gap-3">
        {plans.map((plan) => (
          <button
            key={plan}
            type="button"
            disabled={!pricing}
            onClick={() => onPick(plan)}
            className={clsx(
              "relative flex items-center gap-3 rounded-2xl border p-4 text-left shadow-[0_12px_32px_-24px_rgba(15,17,21,0.3)] transition-transform active:scale-[0.99]",
              PLAN_STYLE[plan].card,
            )}
          >
            {plan === "pro" && plans.length > 1 && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Most popular
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Crown className={clsx("size-4", PLAN_STYLE[plan].crown)} />
                <span className="text-[17px] font-bold tracking-tight">{PLAN_NAME[plan]}</span>
              </div>
              <p className="mt-0.5 text-[13px] font-medium text-text">{paywallTagline(limitsOf(plan))}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-hint">From</p>
              <p className="text-[17px] font-bold tracking-tight">
                {pricing ? formatBirr(pricing.prices[plan].month) : "…"}
                <span className="text-[12px] font-medium text-hint">/month</span>
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-hint" />
          </button>
        ))}
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-hint">
        <ShieldCheck className="size-3.5 shrink-0" />
        One-time payment, no auto-renewal.
      </p>
    </>
  );
}

function PeriodStep({
  plan,
  limits,
  pricing,
  onBack,
  onStarted,
}: {
  plan: PaidPlan;
  limits: PlanLimits;
  pricing: PricingDto;
  onBack: () => void;
  onStarted: (period: Period, paymentId: string, url: string) => void;
}) {
  const checkout = useCheckout();
  const [period, setPeriod] = useState<Period>("month");
  const prices = pricing.prices[plan];

  const pay = () => {
    haptic.select();
    checkout.mutate(
      { plan, period },
      {
        onSuccess: (res) => {
          openCheckout(res.url);
          onStarted(period, res.paymentId, res.url);
        },
        onError: () => haptic.error(),
      },
    );
  };

  return (
    <>
      <button type="button" onClick={onBack} className="-ml-1 inline-flex items-center gap-0.5 text-[13px] font-semibold text-hint">
        <ChevronLeft className="size-4" />
        Plans
      </button>
      <h2 id="paywall-title" className="mt-3 flex items-center gap-2 text-xl font-bold tracking-tight">
        <Crown className={clsx("size-5", PLAN_STYLE[plan].crown)} />
        {PLAN_NAME[plan]}
      </h2>
      <ul className="mt-3 flex flex-col gap-1.5">
        {planBenefits(limits).map((b) => (
          <li key={b} className="flex items-start gap-2 text-[14px]">
            <Check className={clsx("mt-0.5 size-4 shrink-0", PLAN_STYLE[plan].crown)} strokeWidth={2.5} />
            {b}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[15px] font-semibold">How long do you want it for?</p>

      <div className="mt-2.5 flex flex-col gap-2.5" role="radiogroup">
        {SOLD_PERIODS.map((p) => {
          const selected = period === p;
          const save = savingVsMonthly(prices, p);
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                haptic.select();
                setPeriod(p);
              }}
              className={clsx(
                "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                selected ? "border-ink bg-surface ring-1 ring-ink" : "border-separator bg-surface",
              )}
            >
              <span className={clsx("grid size-5 shrink-0 place-items-center rounded-full border", selected ? "border-ink bg-ink text-white" : "border-separator")}>
                {selected && <Check className="size-3" strokeWidth={3.5} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold">{PERIOD_LABEL[p]}</span>
                  {save && <span className="rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-bold text-accent-strong">Save {save}%</span>}
                </span>
                {p === "quarter" && <span className="mt-0.5 block text-[13px] text-hint">{formatBirr(Math.round(prices.quarter / 3))} a month</span>}
              </span>
              <span className="shrink-0 text-[16px] font-bold tracking-tight">{formatBirr(prices[p])}</span>
            </button>
          );
        })}
      </div>

      {checkout.error && (
        <div className="mt-3">
          <ErrorText>{checkout.error.message}</ErrorText>
        </div>
      )}
      <div className="mt-5">
        <Button variant="accent" loading={checkout.isPending} onClick={pay}>
          Continue to payment · {formatBirr(prices[period])}
        </Button>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-hint">
        <ShieldCheck className="size-3.5 shrink-0" />
        Secure payment by SantimPay: Telebirr, CBE Birr, M-Pesa or your bank.
      </p>
    </>
  );
}

/** Waits for SantimPay to confirm, then applies the plan and returns the user to what they wanted. */
function PayingStep({
  plan,
  paymentId,
  url,
  then,
  onRetry,
  onClose,
}: {
  plan: PaidPlan;
  paymentId: string;
  url: string;
  then?: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const refresh = useRefreshMe();
  const status = usePayment(paymentId);
  const state = status.data?.status ?? "pending";

  useEffect(() => {
    if (state === "paid") {
      haptic.success();
      // New limits everywhere: /me, then every list and job that was locked or capped.
      refresh.mutate(undefined, {
        onSettled: () => {
          void queryClient.invalidateQueries();
          onClose();
          if (then) router.push(then);
        },
      });
    } else if (state === "failed" || state === "cancelled") {
      haptic.error();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === "failed" || state === "cancelled") {
    return (
      <div className="flex flex-col items-center pt-4 text-center">
        <XCircle className="size-10 text-danger" />
        <h2 id="paywall-title" className="mt-3 text-xl font-bold tracking-tight">
          {state === "cancelled" ? "Payment cancelled" : "Payment didn't go through"}
        </h2>
        <p className="mt-1.5 text-[15px] text-hint">No money was taken. You can try again whenever you&apos;re ready.</p>
        <div className="mt-5 flex w-full flex-col gap-2">
          <Button onClick={onRetry}>Try again</Button>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center pt-4 text-center">
      <IconTile tone="neutral">{state === "paid" ? <Spinner /> : <Clock className="size-5" />}</IconTile>
      <h2 id="paywall-title" className="mt-4 text-xl font-bold tracking-tight">
        {state === "paid" ? `Switching you to ${PLAN_NAME[plan]}…` : "Finish paying in SantimPay"}
      </h2>
      {state !== "paid" && (
        <>
          <p className="mt-1.5 text-[15px] text-hint">Complete the payment on the page that opened, then come back. {PLAN_NAME[plan]} switches on as soon as it&apos;s confirmed.</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-hint">
            <Spinner />
            Waiting for confirmation…
          </div>
          <div className="mt-5 flex w-full flex-col gap-2">
            <Button variant="secondary" onClick={() => openCheckout(url)}>
              Open payment page again
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
