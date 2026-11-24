"use client";

import clsx from "clsx";
import { Check, CheckCircle2, Clock, Crown, Lock, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CV_PACK_CONTENTS,
  PAID_PLANS,
  PERIOD_LABEL,
  PLAN_NAME,
  PLAN_RANK,
  SOLD_PERIODS,
  type BillingPeriod,
  type CvPackId,
  type MeDto,
  type PaidPlan,
  type PricingDto,
} from "@ethio/shared";
import { ScreenSkeleton } from "@/components/skeletons";
import { useBackButton, useCheckout, usePayment, usePricing, useRefreshMe } from "@/components/miniapp/hooks";
import { PackCards } from "@/components/cv/PackCards";
import { usePackCheckout } from "@/components/cv/hooks";
import { useSession } from "@/components/miniapp/session";
import { Badge, Button, Card, CenteredMessage, ErrorText, IconTile, PageHeader, Screen, Spinner } from "@/components/ui";
import { formatBirr, formatDate, PERIOD_SHORT, PLAN_TAGLINE, planFeatures, savingVsMonthly } from "@/lib/plans";
import { openCheckout } from "@/components/paywall";
import { haptic } from "@/lib/telegram";

export default function PlansPage() {
  const router = useRouter();
  const { me } = useSession();
  const pricing = usePricing();
  const checkout = useCheckout();
  const [period, setPeriod] = useState<(typeof SOLD_PERIODS)[number]>("month");
  const packCheckout = usePackCheckout();
  const [pending, setPending] = useState<{ id: string; url: string; plan: PaidPlan | CvPackId } | null>(null);

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

      <div className="mt-5 flex flex-col gap-5">
        {PAID_PLANS.map((plan) => (
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

      <section id="packs" className="mt-8 scroll-mt-4">
        <h2 className="px-1 text-[18px] font-bold tracking-tight">CV packs</h2>
        <p className="mb-4 mt-0.5 px-1 text-[13px] text-hint">Need more CVs? Buy credits once, use them whenever. Works with any plan, or none.</p>
        <PackCards
          packs={pricing.data.packs}
          busyId={packCheckout.isPending ? packCheckout.variables?.pack : null}
          disabled={packCheckout.isPending || checkout.isPending}
          onBuy={(pack) => {
            haptic.select();
            packCheckout.mutate(
              { pack },
              {
                onSuccess: (res) => {
                  setPending({ id: res.paymentId, url: res.url, plan: pack });
                  openCheckout(res.url);
                },
                onError: () => haptic.error(),
              },
            );
          }}
        />
        {packCheckout.error && (
          <div className="mt-3 px-1">
            <ErrorText>{packCheckout.error.message}</ErrorText>
          </div>
        )}
      </section>

      <p className="mt-6 flex items-center justify-center gap-1.5 px-6 text-center text-xs text-hint">
        <ShieldCheck className="size-3.5 shrink-0" />
        Secure payment by SantimPay. One-time payment, no auto-renewal.
      </p>
    </Screen>
  );
}

function PeriodToggle({
  value,
  onChange,
  pricing,
}: {
  value: (typeof SOLD_PERIODS)[number];
  onChange: (p: (typeof SOLD_PERIODS)[number]) => void;
  pricing: PricingDto;
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-separator bg-surface p-1">
      {SOLD_PERIODS.map((p) => {
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

/** Soft tints per plan (as on gomoxie.app's plan cards). */
const PLAN_STYLE: Record<PaidPlan, { card: string; crown: string }> = {
  pro: {
    card: "border-accent-border bg-[linear-gradient(135deg,#fff1e8_0%,#fff8f3_45%,#ffffff_100%)]",
    crown: "text-accent",
  },
  career: {
    card: "border-sky-200 bg-[linear-gradient(135deg,#e6f4fb_0%,#f3f9fd_45%,#ffffff_100%)]",
    crown: "text-sky-600",
  },
};

function PlanCard({
  plan,
  period,
  me,
  pricing,
  busy,
  disabled,
  onBuy,
}: {
  plan: PaidPlan;
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
  const isCurrent = me.plan === plan;
  const coveredByHigher = me.plan !== "free" && PLAN_RANK[me.plan] > PLAN_RANK[plan];
  const style = PLAN_STYLE[plan];
  const perMonth = period === "quarter" ? Math.round(pricing.prices[plan].quarter / 3) : null;

  return (
    <div className={clsx("relative rounded-2xl border p-4 shadow-[0_12px_32px_-24px_rgba(15,17,21,0.3)]", style.card)}>
      {popular && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_4px_10px_-4px_rgba(255,94,31,0.6)]">
          Most popular
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Crown className={clsx("size-4", style.crown)} />
            <h2 className="text-lg font-bold tracking-tight">{PLAN_NAME[plan]}</h2>
            {isCurrent && <Badge tone="emerald">Current</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-hint">{PLAN_TAGLINE[plan]}</p>
        </div>
        <div className="shrink-0 text-right">
          <p>
            <span className="text-[24px] font-bold tracking-tight">{formatBirr(pricing.prices[plan][period])}</span>
            <span className="ml-0.5 text-[13px] text-hint">{PERIOD_SHORT[period]}</span>
          </p>
          {perMonth && <p className="text-[12px] text-hint">{formatBirr(perMonth)} a month</p>}
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2 border-t border-black/5 pt-3">
        {features.map((f) => (
          <li key={f.text} className={clsx("flex items-start gap-2 text-[14px]", f.missing ? "text-hint-light" : "text-text")}>
            <span className={clsx("mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full", f.missing ? "bg-pill text-hint-light" : "bg-ink text-white")}>
              {f.missing ? <Lock className="size-2.5" /> : <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            <span>
              {f.text}
              {f.soon && <span className="ml-1.5 rounded-full bg-pill px-1.5 py-px text-[11px] font-semibold text-hint">Soon</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {coveredByHigher ? (
          <Button variant="secondary" disabled>
            Included in {PLAN_NAME[me.plan]}
          </Button>
        ) : (
          <Button variant={popular ? "accent" : "primary"} loading={busy} disabled={disabled} onClick={() => onBuy(plan)}>
            {isCurrent ? `Extend ${PLAN_NAME[plan]}` : `Get ${PLAN_NAME[plan]}`} · {formatBirr(pricing.prices[plan][period])}
          </Button>
        )}
        {isCurrent && me.planExpiresAt && (
          <p className="mt-2 text-center text-xs text-hint">Active until {formatDate(me.planExpiresAt)}. Extending adds time to the end.</p>
        )}
      </div>
    </div>
  );
}

/** Shown after the checkout opens: polls until SantimPay confirms (or the user gives up). */
function Waiting({ payment, onDone }: { payment: { id: string; url: string; plan: PaidPlan | CvPackId }; onDone: () => void }) {
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

  if (state === "paid" && payment.plan.startsWith("cv_pack")) {
    const pack = CV_PACK_CONTENTS[payment.plan as CvPackId];
    return (
      <CenteredMessage
        icon={
          <IconTile tone="emerald">
            <CheckCircle2 className="size-5" />
          </IconTile>
        }
        title={`Your ${pack.name} pack is ready`}
        body={`${pack.newCvs} new or improved CVs and ${pack.tailored} tailored CVs added. They never expire.`}
      >
        <Button onClick={() => router.push("/app/cvs")}>Go to my CVs</Button>
      </CenteredMessage>
    );
  }

  if (state === "paid") {
    return (
      <CenteredMessage
        icon={
          <IconTile>
            <CheckCircle2 className="size-5" />
          </IconTile>
        }
        title={`You're on ${PLAN_NAME[payment.plan as PaidPlan]}`}
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
