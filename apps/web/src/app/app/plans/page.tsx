"use client";

import clsx from "clsx";
import { Check, CheckCircle2, Clock, Crown, Lock, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BILLING_PERIODS,
  PERIOD_LABEL,
  PLAN_NAME,
  PLAN_RANK,
  PLANS,
  type BillingPeriod,
  type MeDto,
  type PaidPlan,
  type Plan,
  type PricingDto,
} from "@ethio/shared";
import { BottomNav } from "@/components/BottomNav";
import { ScreenSkeleton } from "@/components/skeletons";
import { useBackButton, useCheckout, usePayment, usePricing, useRefreshMe } from "@/components/miniapp/hooks";
import { useSession } from "@/components/miniapp/session";
import { Badge, Button, Card, CenteredMessage, ErrorText, IconTile, PageHeader, Screen, Spinner } from "@/components/ui";
import { formatBirr, formatDate, PERIOD_SHORT, PLAN_TAGLINE, planFeatures, savingVsMonthly } from "@/lib/plans";
import { getWebApp, haptic } from "@/lib/telegram";

/** Hosted checkout must open outside the Mini App webview. */
function openCheckout(url: string) {
  const wa = getWebApp();
  if (wa) wa.openLink(url);
  else window.open(url, "_blank", "noopener");
}

export default function PlansPage() {
  const router = useRouter();
  const { me } = useSession();
  const pricing = usePricing();
  const checkout = useCheckout();
  const [period, setPeriod] = useState<BillingPeriod>("month");
  const [pending, setPending] = useState<{ id: string; url: string; plan: PaidPlan } | null>(null);

  useBackButton(() => (pending ? setPending(null) : router.push("/app")));

  if (pending) return <Waiting payment={pending} onDone={() => setPending(null)} />;

  if (pricing.isPending) {
    return (
      <ScreenSkeleton variant="plans" />
    );
  }
  if (pricing.isError) {
    return (
      <CenteredMessage title="Couldn't load plans" body={pricing.error.message}>
        <Button onClick={() => void pricing.refetch()}>Try again</Button>
      </CenteredMessage>
    );
  }

  const buy = (plan: PaidPlan) => {
    haptic.select();
    checkout.mutate(
      { plan, period },
      {
        onSuccess: (res) => {
          setPending({ id: res.paymentId, url: res.url, plan });
          openCheckout(res.url);
        },
        onError: () => haptic.error(),
      },
    );
  };

  return (
    <Screen className="animate-fade-up">
      <PageHeader title="Plans" subtitle="Instant job alerts on every plan. Pay with Telebirr, CBE Birr, M-Pesa or your bank." />

      {me.beta && me.plan === "free" && (
        <Card className="mt-4 border-accent-border bg-accent-soft/60">
          <p className="text-[14px] text-accent-strong">
            <span className="font-semibold">You have Pro for free during the beta.</span> Buying a plan now keeps it after the beta ends.
          </p>
        </Card>
      )}

      <PeriodToggle value={period} onChange={setPeriod} pricing={pricing.data} />

      <div className="mt-4 flex flex-col gap-3">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan}
            plan={plan}
            period={period}
            me={me}
            pricing={pricing.data}
            busy={checkout.isPending && checkout.variables?.plan === plan}
            disabled={checkout.isPending}
            onBuy={buy}
          />
        ))}
      </div>

      {checkout.error && (
        <div className="mt-3 px-1">
          <ErrorText>{checkout.error.message}</ErrorText>
        </div>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 px-6 text-center text-xs text-hint">
        <ShieldCheck className="size-3.5 shrink-0" />
        Secure payment by SantimPay. One-time payment, no auto-renewal.
      </p>
      <BottomNav />
    </Screen>
  );
}

function PeriodToggle({ value, onChange, pricing }: { value: BillingPeriod; onChange: (p: BillingPeriod) => void; pricing: PricingDto }) {
  return (
    <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-separator bg-surface p-1">
      {BILLING_PERIODS.map((p) => {
        const save = savingVsMonthly(pricing.prices.pro, p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => {
              haptic.select();
              onChange(p);
            }}
            className={clsx(
              "relative rounded-lg py-2 text-sm font-semibold transition-colors",
              value === p ? "bg-ink text-white" : "text-hint hover:text-text",
            )}
          >
            {PERIOD_LABEL[p]}
            {save && (
              <span className={clsx("ml-1 text-[11px] font-bold", value === p ? "text-accent-mid" : "text-accent-strong")}>-{save}%</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PlanCard({
  plan,
  period,
  me,
  pricing,
  busy,
  disabled,
  onBuy,
}: {
  plan: Plan;
  period: BillingPeriod;
  me: MeDto;
  pricing: PricingDto;
  busy: boolean;
  disabled: boolean;
  onBuy: (plan: PaidPlan) => void;
}) {
  const limits = pricing.limits[plan];
  const features = planFeatures(plan, limits);
  const popular = plan === "pro";
  const paidActive = me.plan !== "free";
  const isCurrent = paidActive ? me.plan === plan : plan === "free" && !me.beta;
  const coveredByHigher = paidActive && plan !== "free" && PLAN_RANK[me.plan] > PLAN_RANK[plan];

  return (
    <Card className={clsx("relative", popular && "border-neutral-300 ring-1 ring-accent/30")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight">{PLAN_NAME[plan]}</h2>
            {popular && <Badge tone="accent">Most popular</Badge>}
            {isCurrent && <Badge tone="emerald">Current</Badge>}
          </div>
          <p className="text-[13px] text-hint">{PLAN_TAGLINE[plan]}</p>
        </div>
        {plan !== "free" && <Crown className={clsx("size-5", plan === "career" ? "text-accent" : "text-hint-light")} />}
      </div>

      <p className="mt-3">
        {plan === "free" ? (
          <span className="text-[28px] font-bold tracking-tight">0 Br</span>
        ) : (
          <>
            <span className="text-[28px] font-bold tracking-tight">{formatBirr(pricing.prices[plan][period])}</span>
            <span className="ml-1 text-sm text-hint">{PERIOD_SHORT[period]}</span>
          </>
        )}
      </p>

      <ul className="mt-3 flex flex-col gap-2 border-t border-separator-subtle pt-3">
        {features.map((f) => (
          <li key={f.text} className={clsx("flex items-start gap-2 text-[14px]", f.missing ? "text-hint-light" : "text-text")}>
            <span
              className={clsx(
                "mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full",
                f.missing ? "bg-pill text-hint-light" : plan === "free" ? "bg-pill text-hint" : "bg-ink text-white",
              )}
            >
              {f.missing ? <Lock className="size-2.5" /> : <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            <span>
              {f.text}
              {f.soon && <span className="ml-1.5 rounded-full bg-pill px-1.5 py-px text-[11px] font-semibold text-hint">Soon</span>}
            </span>
          </li>
        ))}
      </ul>

      {plan !== "free" && (
        <div className="mt-4">
          {coveredByHigher ? (
            <Button variant="secondary" disabled>
              Included in {PLAN_NAME[me.plan]}
            </Button>
          ) : (
            <Button variant={popular ? "accent" : "primary"} loading={busy} disabled={disabled} onClick={() => onBuy(plan)}>
              {me.plan === plan ? `Extend ${PLAN_NAME[plan]}` : `Get ${PLAN_NAME[plan]}`} · {formatBirr(pricing.prices[plan][period])}
            </Button>
          )}
          {me.plan === plan && me.planExpiresAt && (
            <p className="mt-2 text-center text-xs text-hint">Active until {formatDate(me.planExpiresAt)}. Extending adds time to the end.</p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Shown after the checkout opens: polls until SantimPay confirms (or the user gives up). */
function Waiting({ payment, onDone }: { payment: { id: string; url: string; plan: PaidPlan }; onDone: () => void }) {
  const router = useRouter();
  const status = usePayment(payment.id);
  const refresh = useRefreshMe();
  const state = status.data?.status ?? "pending";

  useEffect(() => {
    if (state === "paid") {
      haptic.success();
      refresh.mutate();
    } else if (state === "failed" || state === "cancelled") {
      haptic.error();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === "paid") {
    return (
      <CenteredMessage
        icon={
          <IconTile>
            <CheckCircle2 className="size-5" />
          </IconTile>
        }
        title={`You're on ${PLAN_NAME[payment.plan]}`}
        body={
          status.data?.periodEnd
            ? `Active until ${formatDate(status.data.periodEnd)}. Matching NGO, international and overseas jobs are on their way.`
            : "Matching NGO, international and overseas jobs are on their way."
        }
      >
        <Button onClick={() => router.push("/app/jobs")}>Back to jobs</Button>
      </CenteredMessage>
    );
  }

  if (state === "failed" || state === "cancelled") {
    return (
      <CenteredMessage
        icon={<XCircle className="size-10 text-danger" />}
        title={state === "cancelled" ? "Payment cancelled" : "Payment didn't go through"}
        body="No money was taken. You can try again whenever you're ready."
      >
        <Button onClick={onDone}>Back to plans</Button>
      </CenteredMessage>
    );
  }

  return (
    <CenteredMessage
      icon={
        <IconTile tone="neutral">
          <Clock className="size-5" />
        </IconTile>
      }
      title="Finish paying in SantimPay"
      body="Complete the payment on the page that opened, then come back here. We'll switch your plan on as soon as it's confirmed."
    >
      <div className="flex flex-col gap-2">
        <div className="mb-2 flex items-center justify-center gap-2 text-sm text-hint">
          <Spinner />
          Waiting for confirmation…
        </div>
        <Button onClick={() => openCheckout(payment.url)}>Open payment page again</Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </CenteredMessage>
  );
}
