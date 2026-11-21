import { describe, expect, it } from "vitest";
import { validateTaxonomy } from "../prisma/seed-data/validate";
import { FUNCTIONS } from "../prisma/seed-data/taxonomy";

describe("taxonomy seed", () => {
  it("has unique, well-formed ids", () => {
    expect(validateTaxonomy()).toEqual([]);
  });

  it("covers a useful number of professions", () => {
    const count = FUNCTIONS.reduce((n, f) => n + f.professions.length, 0);
    expect(count).toBeGreaterThan(150);
  });
});
