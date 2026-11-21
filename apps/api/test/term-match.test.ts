import { describe, expect, it } from "vitest";
import { LOCAL_ACCEPT, normalizeTerm, rankCandidates, similarity } from "../src/taxonomy/term-match";

const fields = [
  { id: "accounting", name: "Accounting", aliases: ["Accounting and Finance", "አካውንቲንግ"] },
  { id: "tourism", name: "Tourism & Hotel Management", aliases: ["Hospitality Management", "Hotel Management"] },
  { id: "computer_science", name: "Computer Science", aliases: ["CS"] },
  { id: "civil_engineering", name: "Civil Engineering", aliases: [] },
  { id: "nursing", name: "Nursing", aliases: ["Comprehensive Nursing"] },
];

describe("normalizeTerm", () => {
  it("lowercases, drops punctuation, keeps Ethiopic", () => {
    expect(normalizeTerm("  BSc. in Computer-Science!! ")).toBe("bsc in computer science");
    expect(normalizeTerm("አካውንቲንግ")).toBe("አካውንቲንግ");
  });
});

describe("local matching (free, no AI)", () => {
  it("accepts typos, degree prefixes, aliases and Amharic", () => {
    for (const [typed, id] of [
      ["Acounting", "accounting"],
      ["BSc in Accounting", "accounting"],
      ["አካውንቲንግ", "accounting"],
      ["Comprehensive Nursing", "nursing"],
    ] as const) {
      const [best] = rankCandidates(typed, fields);
      expect(best?.id, typed).toBe(id);
      expect(best!.score, typed).toBeGreaterThanOrEqual(LOCAL_ACCEPT);
    }
  });

  it("ranks the right option first for abbreviations, which go to the AI", () => {
    const [best] = rankCandidates("hotel mgmt", fields);
    expect(best?.id).toBe("tourism");
    expect(best!.score).toBeLessThan(LOCAL_ACCEPT);
  });

  it("leaves unrelated terms below the threshold (they go to the AI)", () => {
    const [best] = rankCandidates("Cooperative Marketing", fields);
    expect(best?.score ?? 0).toBeLessThan(LOCAL_ACCEPT);
  });

  it("similarity is 1 for equal and 0 for empty", () => {
    expect(similarity("nursing", "nursing")).toBe(1);
    expect(similarity("", "nursing")).toBe(0);
  });
});
