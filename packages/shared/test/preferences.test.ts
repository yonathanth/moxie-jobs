import { describe, expect, it } from "vitest";
import { preferencesInputSchema } from "../src/preferences";
import { educationRank } from "../src/enums";

describe("preferencesInputSchema", () => {
  it("fills defaults and de-duplicates ids", () => {
    const p = preferencesInputSchema.parse({ professionIds: ["accountant", "accountant", "auditor"] });
    expect(p.professionIds).toEqual(["accountant", "auditor"]);
    expect(p.remoteOk).toBe(true);
    expect(p.locationIds).toEqual([]);
    expect(p.educationLevel).toBeNull();
  });

  it("requires at least one profession, function or field of study", () => {
    expect(preferencesInputSchema.safeParse({}).success).toBe(false);
    expect(preferencesInputSchema.safeParse({ fieldOfStudyIds: ["accounting"] }).success).toBe(true);
  });

  it("rejects unknown enum values", () => {
    expect(preferencesInputSchema.safeParse({ functionIds: ["it"], experienceBand: "50" }).success).toBe(false);
    expect(preferencesInputSchema.safeParse({ functionIds: ["it"], employmentTypes: ["gig"] }).success).toBe(false);
  });
});

describe("educationRank", () => {
  it("orders levels", () => {
    expect(educationRank("bachelor")).toBeGreaterThan(educationRank("diploma"));
    expect(educationRank("none")).toBe(0);
  });
});
