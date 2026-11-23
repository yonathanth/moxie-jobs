import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_LIMITS, DEFAULT_PRICES, MAX_LIMITS, resolvePrices } from "@ethio/shared";
import { DEFAULT_SETTINGS, effectivePlan, resolveLimits, settingsSchema } from "../src/settings/plan";

const noBeta = settingsSchema.parse({ betaAllPro: false });
const NOW = new Date("2026-11-17T00:00:00Z");

describe("effectivePlan", () => {
  it("gives everyone pro during the beta, but a paid career plan still wins", () => {
    expect(effectivePlan({ plan: "free", planExpiresAt: null }, DEFAULT_SETTINGS, NOW)).toBe("pro");
    expect(effectivePlan({ plan: "career", planExpiresAt: new Date("2026-12-01") }, DEFAULT_SETTINGS, NOW)).toBe("career");
  });

  it("honours paid plans and their expiry", () => {
    expect(effectivePlan({ plan: "free", planExpiresAt: null }, noBeta, NOW)).toBe("free");
    expect(effectivePlan({ plan: "pro", planExpiresAt: null }, noBeta, NOW)).toBe("pro");
    expect(effectivePlan({ plan: "pro", planExpiresAt: new Date("2026-12-01") }, noBeta, NOW)).toBe("pro");
    expect(effectivePlan({ plan: "career", planExpiresAt: new Date("2026-12-01") }, noBeta, NOW)).toBe("career");
    expect(effectivePlan({ plan: "pro", planExpiresAt: new Date("2026-11-01") }, noBeta, NOW)).toBe("free");
  });
});

describe("resolveLimits", () => {
  it("uses defaults when nothing is overridden", () => {
    expect(resolveLimits("free", DEFAULT_SETTINGS)).toEqual(DEFAULT_PLAN_LIMITS.free);
    expect(resolveLimits("career", DEFAULT_SETTINGS)).toEqual(DEFAULT_PLAN_LIMITS.career);
  });

  it("free: 10 alerts a day, no premium jobs, no categories; paid plans unlimited with premium jobs", () => {
    expect(DEFAULT_PLAN_LIMITS.free).toMatchObject({ dailyJobCap: 10, premiumJobs: false, maxFunctions: 3, maxProfessions: 10 });
    expect(DEFAULT_PLAN_LIMITS.pro).toMatchObject({ dailyJobCap: null, premiumJobs: true });
  });

  it("applies valid overrides, ignores bad ones and caps at the hard maximum", () => {
    const s = settingsSchema.parse({
      planLimits: { free: { maxProfessions: 3, maxFunctions: -1, maxLocations: 999, dailyJobCap: 5, premiumJobs: true } },
    });
    const limits = resolveLimits("free", s);
    expect(limits.maxProfessions).toBe(3);
    expect(limits.maxFunctions).toBe(DEFAULT_PLAN_LIMITS.free.maxFunctions);
    expect(limits.maxLocations).toBe(MAX_LIMITS.maxLocations);
    expect(limits.dailyJobCap).toBe(5);
    expect(limits.premiumJobs).toBe(true);
  });

  it("lets admins remove the daily cap with null", () => {
    expect(resolveLimits("free", settingsSchema.parse({ planLimits: { free: { dailyJobCap: null } } })).dailyJobCap).toBeNull();
  });
});

describe("resolvePrices", () => {
  it("merges partial overrides over the defaults", () => {
    expect(resolvePrices(DEFAULT_SETTINGS)).toEqual(DEFAULT_PRICES);
    const p = resolvePrices(settingsSchema.parse({ prices: { pro: { month: 99 } } }));
    expect(p.pro).toEqual({ ...DEFAULT_PRICES.pro, month: 99 });
    expect(p.career).toEqual(DEFAULT_PRICES.career);
  });
});
