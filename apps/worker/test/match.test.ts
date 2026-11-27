import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_LIMITS } from "@ethio/shared";
import { matchJob, type MatchCandidate, type MatchJob } from "../src/delivery/match";

const p2f = new Map([
  ["accountant", "accounting_finance"],
  ["auditor", "accounting_finance"],
  ["nurse", "health"],
]);

const job = (o: Partial<MatchJob> = {}): MatchJob => ({
  title: "Accountant",
  professionId: "accountant",
  functionId: "accounting_finance",
  fieldOfStudyIds: ["accounting"],
  educationLevel: "bachelor",
  experienceMin: 0,
  experienceMax: 2,
  locationIds: ["addis_ababa"],
  workMode: "onsite",
  employmentType: "full_time",
  genderReq: "any",
  isOverseas: false,
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  ...o,
});

const user = (o: Partial<MatchCandidate> = {}): MatchCandidate => ({
  professionIds: ["accountant"],
  functionIds: [],
  fieldOfStudyIds: [],
  educationLevel: "bachelor",
  experienceBand: "1-2",
  locationIds: ["addis_ababa"],
  remoteOk: true,
  employmentTypes: [],
  gender: null,
  overseasOk: false,
  salaryMin: null,
  ...o,
});

const pro = DEFAULT_PLAN_LIMITS.pro;
const run = (j: MatchJob, u: MatchCandidate, limits = pro) => matchJob(j, u, limits, p2f);

describe("matchJob: target", () => {
  it("matches on profession, followed category, or degree", () => {
    expect(run(job(), user())).toEqual({ ok: true, via: "profession" });
    expect(run(job({ professionId: "auditor" }), user({ professionIds: [], functionIds: ["accounting_finance"] }))).toEqual({
      ok: true,
      via: "function",
    });
    expect(run(job({ professionId: null }), user({ professionIds: [], fieldOfStudyIds: ["accounting"] }))).toEqual({ ok: true, via: "field" });
  });

  it("doesn't match on degree alone when the job is in an unrelated category", () => {
    const u = user({ professionIds: ["nurse"], fieldOfStudyIds: ["accounting"] });
    expect(run(job({ professionId: "auditor" }), u)).toEqual({ ok: false, reason: "target" });
    // ...but does when the category relates to what they follow
    expect(run(job({ professionId: "auditor" }), user({ professionIds: ["accountant"], fieldOfStudyIds: ["accounting"] }))).toMatchObject({
      ok: true,
    });
  });

  it("skips roles left out of a followed category, even when the degree matches", () => {
    const u = user({ professionIds: [], functionIds: ["accounting_finance"], excludedProfessionIds: ["auditor"], fieldOfStudyIds: ["accounting"] });
    expect(run(job({ professionId: "auditor" }), u)).toEqual({ ok: false, reason: "excluded" });
    expect(run(job({ professionId: "accountant" }), u)).toEqual({ ok: true, via: "function" });
    // A job with no specific role still matches the category.
    expect(run(job({ professionId: null }), u)).toEqual({ ok: true, via: "function" });
  });

  it("ignores 'any field' as a degree match", () => {
    expect(run(job({ professionId: null, fieldOfStudyIds: ["any_field"] }), user({ professionIds: [], fieldOfStudyIds: ["accounting"] })).ok).toBe(false);
  });

  it("counts only the first N professions on the current plan", () => {
    const u = user({ professionIds: ["nurse", "auditor", "accountant"] });
    expect(run(job(), u, { ...DEFAULT_PLAN_LIMITS.free, maxProfessions: 2 }).ok).toBe(false); // only the first 2 count
    expect(run(job(), u, pro).ok).toBe(true);
  });
});

describe("matchJob: filters", () => {
  it("education: user must meet the minimum", () => {
    expect(run(job({ educationLevel: "master" }), user()).ok).toBe(false);
    expect(run(job({ educationLevel: "diploma" }), user()).ok).toBe(true);
    expect(run(job(), user({ educationLevel: null })).ok).toBe(true);
  });

  it("experience: ranges must overlap", () => {
    expect(run(job({ experienceMin: 3, experienceMax: null }), user({ experienceBand: "0" })).ok).toBe(false);
    expect(run(job({ experienceMin: 2, experienceMax: null }), user({ experienceBand: "10+" })).ok).toBe(true);
    expect(run(job({ experienceMin: 0, experienceMax: 2 }), user({ experienceBand: "10+" })).ok).toBe(false);
    expect(run(job({ experienceMin: null, experienceMax: null }), user({ experienceBand: "0" })).ok).toBe(true);
  });

  it("location: cities, anywhere, remote", () => {
    expect(run(job({ locationIds: ["hawassa"] }), user()).ok).toBe(false);
    expect(run(job({ locationIds: ["hawassa"] }), user({ locationIds: [] })).ok).toBe(true);
    expect(run(job({ locationIds: [] }), user()).ok).toBe(true);
    expect(run(job({ workMode: "remote", locationIds: [] }), user({ remoteOk: false })).ok).toBe(false);
    expect(run(job({ workMode: "remote", locationIds: [] }), user()).ok).toBe(true);
  });

  it("overseas jobs only for users who opted in", () => {
    expect(run(job({ isOverseas: true, locationIds: [] }), user())).toEqual({ ok: false, reason: "overseas" });
    expect(run(job({ isOverseas: true, locationIds: [] }), user({ overseasOk: true })).ok).toBe(true);
  });

  it("employment type and gender", () => {
    expect(run(job({ employmentType: "internship" }), user({ employmentTypes: ["full_time"] })).ok).toBe(false);
    expect(run(job({ genderReq: "female" }), user({ gender: "male" }))).toEqual({ ok: false, reason: "gender" });
    expect(run(job({ genderReq: "female" }), user({ gender: null })).ok).toBe(true);
    expect(run(job({ genderReq: "female" }), user({ gender: "female" })).ok).toBe(true);
  });
});

import { isThinJob } from "../src/delivery/match";

describe("seniority by title", () => {
  it("skips junior titles for 6+ year profiles", () => {
    const r = matchJob(job({ title: "Junior Claims Officer", experienceMin: 2, experienceMax: null }), user({ experienceBand: "6-9" }), DEFAULT_PLAN_LIMITS.pro, p2f);
    expect(r).toEqual({ ok: false, reason: "seniority" });
  });
  it("skips manager titles without stated experience for entry-level profiles", () => {
    const r = matchJob(job({ title: "Finance Manager", experienceMin: null, experienceMax: null }), user({ experienceBand: "0" }), DEFAULT_PLAN_LIMITS.pro, p2f);
    expect(r).toEqual({ ok: false, reason: "seniority" });
  });
  it("keeps normal titles", () => {
    expect(matchJob(job({ title: "Accountant", experienceMin: 2, experienceMax: null }), user({ experienceBand: "6-9" }), DEFAULT_PLAN_LIMITS.pro, p2f).ok).toBe(true);
  });
});

describe("isThinJob", () => {
  const base = { summary: "ANFB Trading PLC is hiring a Cashier.", deadline: null, educationLevel: null, experienceMin: null, experienceMax: null, salaryMin: null, applyMethod: "source" };
  it("flags a title-only job", () => expect(isThinJob(base)).toBe(true));
  it("keeps a job with a deadline and requirements", () =>
    expect(isThinJob({ ...base, deadline: new Date(), educationLevel: "bachelor" })).toBe(false));
  it("keeps one fact plus a real summary", () =>
    expect(isThinJob({ ...base, educationLevel: "bachelor", summary: "Ethio Impact Consulting is hiring a Finance Manager with a background in accounting, finance or economics." })).toBe(false));
});

describe("salary", () => {
  const u = (salaryMin: number | null) => user({ salaryMin });
  it("skips jobs that state a lower monthly pay", () => {
    expect(matchJob(job({ salaryMin: 8000, salaryMax: 9000, salaryCurrency: "ETB", salaryPeriod: "month" }), u(10000), DEFAULT_PLAN_LIMITS.pro, p2f)).toEqual({ ok: false, reason: "salary" });
  });
  it("uses the top of the range and converts yearly pay", () => {
    expect(matchJob(job({ salaryMin: 8000, salaryMax: 12000, salaryPeriod: "month" }), u(10000), DEFAULT_PLAN_LIMITS.pro, p2f).ok).toBe(true);
    expect(matchJob(job({ salaryMax: 96000, salaryPeriod: "year" }), u(10000), DEFAULT_PLAN_LIMITS.pro, p2f)).toEqual({ ok: false, reason: "salary" });
  });
  it("keeps jobs that don't state pay, or state it in another currency", () => {
    expect(matchJob(job(), u(10000), DEFAULT_PLAN_LIMITS.pro, p2f).ok).toBe(true);
    expect(matchJob(job({ salaryMax: 500, salaryCurrency: "USD" }), u(10000), DEFAULT_PLAN_LIMITS.pro, p2f).ok).toBe(true);
  });
});
