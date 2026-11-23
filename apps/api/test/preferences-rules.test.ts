import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_LIMITS, preferencesInputSchema } from "@ethio/shared";
import { checkPreferences } from "../src/preferences/preferences.rules";

const taxonomy = {
  professionIds: new Set(["accountant", "auditor", "cashier", "nurse"]),
  functionIds: new Set(["accounting_finance", "health"]),
  fieldOfStudyIds: new Set(["accounting", "nursing"]),
};

const parse = (v: unknown) => preferencesInputSchema.parse(v);

describe("checkPreferences", () => {
  it("accepts valid preferences within limits", () => {
    const p = parse({ professionIds: ["accountant"], fieldOfStudyIds: ["accounting"], locationIds: ["addis_ababa"] });
    expect(checkPreferences(p, taxonomy, { ...DEFAULT_PLAN_LIMITS.free, maxProfessions: 2 })).toEqual([]);
  });

  it("flags unknown ids", () => {
    const p = parse({ professionIds: ["astronaut"], locationIds: ["atlantis"] });
    const issues = checkPreferences(p, taxonomy, DEFAULT_PLAN_LIMITS.pro);
    expect(issues.map((i) => i.path).sort()).toEqual(["locationIds", "professionIds"]);
  });

  it("enforces the plan's caps", () => {
    const p = parse({ professionIds: ["accountant", "auditor", "cashier"] });
    expect(checkPreferences(p, taxonomy, { ...DEFAULT_PLAN_LIMITS.free, maxProfessions: 2 })).toEqual([
      { path: "professionIds", message: "Your plan allows up to 2 professions" },
    ]);
    expect(checkPreferences(p, taxonomy, DEFAULT_PLAN_LIMITS.pro)).toEqual([]);
  });
});
