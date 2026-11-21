import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_LIMITS } from "@ethio/shared";
import { allowanceLeft, cvAsText, cvTitle, decideCharge, jobDescriptionFor, toPlainContent, type ChargeInput } from "../src/cv/cv.rules";

const base: ChargeInput = {
  flow: "create",
  freeBase: false,
  tasterUsed: true,
  limits: DEFAULT_PLAN_LIMITS.free,
  usedThisMonth: { new: 0, tailor: 0 },
  unpaidCount: 0,
  unpaidCap: 2,
};

describe("decideCharge", () => {
  it("the base CV is free when started from a job with no CV yet", () => {
    expect(decideCharge({ ...base, freeBase: true })).toEqual({ charge: "free_base" });
  });
  it("the first tailoring is free for everyone", () => {
    expect(decideCharge({ ...base, flow: "tailor", tasterUsed: false })).toEqual({ charge: "taster" });
  });
  it("Free: made now, pay to download (49 new, 19 tailored)", () => {
    expect(decideCharge(base)).toEqual({ charge: "locked", product: "cv_new" });
    expect(decideCharge({ ...base, flow: "improve" })).toEqual({ charge: "locked", product: "cv_new" });
    expect(decideCharge({ ...base, flow: "tailor" })).toEqual({ charge: "locked", product: "cv_tailor" });
  });
  it("Free: blocked once the unpaid cap is reached", () => {
    expect(decideCharge({ ...base, unpaidCount: 2 })).toEqual({ blocked: "unpaid_cap" });
  });
  it("Pro: allowance first, then pay per CV", () => {
    const pro = { ...base, limits: DEFAULT_PLAN_LIMITS.pro };
    expect(decideCharge({ ...pro, usedThisMonth: { new: 1, tailor: 0 } })).toEqual({ charge: "plan" });
    expect(decideCharge({ ...pro, usedThisMonth: { new: 2, tailor: 0 } })).toEqual({ charge: "locked", product: "cv_new" });
    expect(decideCharge({ ...pro, flow: "tailor", usedThisMonth: { new: 0, tailor: 9 } })).toEqual({ charge: "plan" });
    expect(decideCharge({ ...pro, flow: "tailor", usedThisMonth: { new: 0, tailor: 10 } })).toEqual({ charge: "locked", product: "cv_tailor" });
  });
  it("Career: unlimited tailoring (fair use)", () => {
    const career = { ...base, flow: "tailor" as const, limits: DEFAULT_PLAN_LIMITS.career };
    expect(decideCharge({ ...career, usedThisMonth: { new: 0, tailor: 60 } })).toEqual({ charge: "plan" });
    expect(allowanceLeft(null, 100)).toBe(0);
    expect(allowanceLeft(null, 3)).toBeNull();
  });
});

describe("text for the engine", () => {
  const cv = {
    personal: { full_name: "Abebe Kebede", title: "Accountant", email: "a@b.com", phone: "+251911" },
    summary: "Accountant with 4 years.",
    experience: [{ company: "Dashen Bank", role: "Accountant", start_date: "2021-01", end_date: "present", bullets: ["Prepared statements"] }],
    education: [{ institution: "AAU", degree: "BA", field: "Accounting", end_date: "2019" }],
    skills: ["Excel", "IFRS"],
  };
  it("turns a saved CV into readable text", () => {
    const t = cvAsText(cv);
    expect(t).toContain("Abebe Kebede — Accountant");
    expect(t).toContain("Accountant at Dashen Bank (2021-01 – present)\n- Prepared statements");
    expect(t).toContain("SKILLS\nExcel, IFRS");
  });
  it("uses the original post for tailoring when there is one", () => {
    const job = { title: "Senior Accountant", company: "Oromia Bank", summary: "Short." };
    expect(jobDescriptionFor(job, "x".repeat(200))).toMatch(/^Senior Accountant at Oromia Bank\n\nx+/);
    expect(jobDescriptionFor(job, null)).toBe("Senior Accountant at Oromia Bank\n\nShort.");
  });
  it("titles CVs", () => {
    expect(cvTitle("base", cv)).toBe("Accountant — Abebe Kebede");
    expect(cvTitle("tailored", cv, { title: "Senior Accountant", company: "Oromia Bank" })).toBe("Senior Accountant at Oromia Bank");
    expect(cvTitle("base", { personal: {} })).toBe("My CV");
  });
});

describe("toPlainContent", () => {
  it("turns polished bullets and skill groups back into our shape", () => {
    const out = toPlainContent({
      personal: { full_name: "A" },
      experience: [{ role: "Accountant", bullets: [{ text: "Did reconciliations" }, { label: "Impact", text: "Closed books 4 days faster" }, "kept as is"] }],
      skills: ["Excel"],
      skillGroups: [{ category: "Technical", items: ["Excel", "IFRS"] }],
    });
    expect(out.experience?.[0]?.bullets).toEqual(["Did reconciliations", "Impact: Closed books 4 days faster", "kept as is"]);
    expect(out.skills).toEqual(["Excel", "IFRS"]);
    expect("skillGroups" in out).toBe(false);
  });
});
