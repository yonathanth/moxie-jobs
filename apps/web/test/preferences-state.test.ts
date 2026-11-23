import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_LIMITS } from "@ethio/shared";
import { formatBirrInput, parseBirr } from "../src/components/preferences/SalaryRange";
import { EMPTY_PREFERENCES, overLimits, salaryInvalid, trimToLimits } from "../src/components/preferences/state";

const prefs = {
  ...EMPTY_PREFERENCES,
  professionIds: ["a", "b", "c", "d"],
  functionIds: ["banking_insurance", "accounting_finance", "sales_marketing", "software_it"],
};

// Explicit small limits: the behaviour under test, independent of today's defaults.
const SMALL = { ...DEFAULT_PLAN_LIMITS.free, maxProfessions: 2, maxFunctions: 0 };
const MID = { ...DEFAULT_PLAN_LIMITS.pro, maxProfessions: 5, maxFunctions: 3 };
const BIG = { ...DEFAULT_PLAN_LIMITS.career, maxProfessions: 10, maxFunctions: 8 };

describe("over plan limits", () => {
  it("lists what exceeds the plan", () => {
    expect(overLimits(prefs, SMALL)).toEqual([
      { label: "professions", have: 4, max: 2 },
      { label: "whole categories", have: 4, max: 0 },
    ]);
    expect(overLimits(prefs, MID)).toEqual([{ label: "whole categories", have: 4, max: 3 }]);
    expect(overLimits(prefs, BIG)).toEqual([]);
  });

  it("keeps the first N, the ones already used for matching", () => {
    const t = trimToLimits(prefs, MID);
    expect(t.professionIds).toEqual(["a", "b", "c", "d"]);
    expect(t.functionIds).toEqual(["banking_insurance", "accounting_finance", "sales_marketing"]);
    expect(overLimits(t, MID)).toEqual([]);
  });
});

describe("salary", () => {
  it("parses typed birr amounts", () => {
    expect(parseBirr("12,500")).toBe(12500);
    expect(parseBirr("Br 8000")).toBe(8000);
    expect(parseBirr("")).toBeNull();
    expect(formatBirrInput(25000)).toBe("25,000");
  });
  it("flags From above To", () => {
    expect(salaryInvalid({ ...EMPTY_PREFERENCES, salaryMin: 20000, salaryMax: 10000 })).toBe(true);
    expect(salaryInvalid({ ...EMPTY_PREFERENCES, salaryMin: 10000, salaryMax: null })).toBe(false);
  });
});
