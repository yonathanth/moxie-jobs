import { PERIOD_DAYS, type BillingPeriod, type PaidPlan } from "@ethio/shared";

/** Pure plan-period math, unit-tested. */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a newly paid period starts and ends. Renewing the same plan extends it
 * from the current end; switching plans (e.g. Pro → Career) starts now, so the
 * user gets the better plan immediately.
 */
export function nextPlanPeriod(
  user: { plan: string; planExpiresAt: Date | null },
  bought: { plan: PaidPlan; period: BillingPeriod },
  now: Date,
): { start: Date; end: Date } {
  const active = user.planExpiresAt !== null && user.planExpiresAt > now;
  const start = active && user.plan === bought.plan ? user.planExpiresAt! : now;
  return { start, end: new Date(start.getTime() + PERIOD_DAYS[bought.period] * DAY_MS) };
}

/**
 * Amount check for a verified payment (SantimPay reports amounts as strings).
 * At least the price passes: with fullParams the status API may report a
 * totalAmount that includes the customer's fee. Less than the price fails.
 */
export function amountMatches(expected: number, reported: string | number | undefined): boolean {
  if (reported === undefined || reported === null || reported === "") return true; // status API may omit it
  const n = typeof reported === "number" ? reported : Number(String(reported).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > expected - 0.01;
}
