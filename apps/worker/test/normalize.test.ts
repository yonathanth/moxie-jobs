import { describe, expect, it } from "vitest";
import { extractedJobSchema } from "../src/ai/schema";
import { applyRank, chooseSourceUrl, isJobBoardUrl, jobSlug, normalizeJob } from "../src/pipeline/normalize";

const taxonomy = {
  professionToFunction: new Map([
    ["junior_accountant", "accounting_finance"],
    ["driver", "logistics_driving"],
  ]),
  functionIds: new Set(["accounting_finance", "logistics_driving"]),
  fieldOfStudyIds: new Set(["accounting", "finance"]),
};
const source = { id: "ethiojobs", handle: "ethiojobsofficial", format: "miniapp_link", websiteDomains: ["ethiojobs.net"] };
const post = {
  messageId: 16453n,
  postedAt: new Date("2026-11-19T10:00:00Z"),
  links: [],
  buttons: [{ text: "Apply Now", url: "http://t.me/ethiojobs_netbot?startapp=job_id_586804" }],
  pageUrl: null,
};
const NOW = new Date("2026-11-19T12:00:00Z");

const job = (over: Record<string, unknown> = {}) =>
  extractedJobSchema.parse({
    title: "Junior Accountant",
    raw_title: "Jr. Accountant",
    company: "Kerchanshe Trading PLC",
    profession_id: "junior_accountant",
    function_id: "accounting_finance",
    field_of_study_ids: ["accounting", "astrology"],
    education_level: "bachelor",
    experience_min_years: 0,
    experience_max_years: 2,
    employment_type: "full_time",
    work_mode: "onsite",
    location_raw: "Jimma",
    city_ids: ["jimma", "atlantis"],
    country: null,
    positions: 2,
    salary: null,
    gender: "any",
    deadline: { date: "2026-11-22", calendar: "gregorian", raw: "Nov 22, 2026", ethiopian: null },
    apply: { method: "source", url: null, email: null, telegram: null, phone: null, notes: null },
    summary: "Kerchanshe is hiring two junior accountants in Jimma.",
    skills: ["Peachtree", "Excel", "Excel"],
    flags: [],
    ...over,
  });

describe("normalizeJob", () => {
  it("keeps valid taxonomy ids and drops unknown ones", () => {
    const d = normalizeJob(job(), { source, post, taxonomy, now: NOW })!;
    expect(d.professionId).toBe("junior_accountant");
    expect(d.functionId).toBe("accounting_finance");
    expect(d.fieldOfStudyIds).toEqual(["accounting"]);
    expect(d.locationIds).toEqual(["jimma"]);
    expect(d.skills).toEqual(["Peachtree", "Excel"]);
    expect(d.companyKey).toBe("kerchanshe trading");
    expect(d.status).toBe("active");
  });

  it("sets deadlines to the end of the day in Addis Ababa", () => {
    const d = normalizeJob(job(), { source, post, taxonomy, now: NOW })!;
    expect(d.deadline?.toISOString()).toBe("2026-11-22T20:59:59.000Z");
  });

  it("converts Ethiopian-calendar deadlines itself", () => {
    const d = normalizeJob(
      job({ deadline: { date: "2026-11-30", calendar: "ethiopian", raw: "ኅዳር 15 2019", ethiopian: { year: 2019, month: 3, day: 15 } } }),
      { source, post, taxonomy, now: NOW },
    )!;
    expect(d.deadline?.toISOString().slice(0, 10)).toBe("2026-11-24");
  });

  it("marks past deadlines expired and unmapped jobs for review", () => {
    expect(
      normalizeJob(job({ deadline: { date: "2026-11-01", calendar: "gregorian", raw: null, ethiopian: null } }), {
        source,
        post,
        taxonomy,
        now: NOW,
      })!.status,
    ).toBe("expired");
    expect(normalizeJob(job({ profession_id: "astronaut", function_id: "space" }), { source, post, taxonomy, now: NOW })!.status).toBe(
      "review",
    );
  });

  it("never uses a job-board page as the employer apply link", () => {
    const d = normalizeJob(job({ apply: { method: "url", url: "https://ethiojobs.net/jobs/1", email: null, telegram: null, phone: null, notes: null } }), {
      source,
      post,
      taxonomy,
      now: NOW,
    })!;
    expect(d.applyMethod).toBe("source");
    expect(d.applyUrl).toBeNull();
  });

  it("falls back from a missing url to email", () => {
    const d = normalizeJob(job({ apply: { method: "url", url: null, email: "HR@Example.com", telegram: null, phone: null, notes: null } }), {
      source,
      post,
      taxonomy,
      now: NOW,
    })!;
    expect(d.applyMethod).toBe("email");
    expect(d.applyEmail).toBe("hr@example.com");
  });

  it("flags overseas jobs", () => {
    const d = normalizeJob(job({ country: "Saudi Arabia", city_ids: [] }), { source, post, taxonomy, now: NOW })!;
    expect(d.isOverseas).toBe(true);
    expect(d.qualityFlags).toContain("overseas");
  });

  it("drops candidates with no title or summary", () => {
    expect(normalizeJob(job({ title: null, raw_title: null }), { source, post, taxonomy, now: NOW })).toBeNull();
    expect(normalizeJob(job({ summary: "" }), { source, post, taxonomy, now: NOW })).toBeNull();
  });
});

describe("chooseSourceUrl", () => {
  it("prefers the board's mini app link for mini-app sources", () => {
    expect(chooseSourceUrl(source, post)).toBe("https://t.me/ethiojobs_netbot?startapp=job_id_586804");
  });

  it("uses the linked website page, else the telegram post", () => {
    const effoy = { id: "effoy", handle: "effoyjobs", format: "website_link", websiteDomains: ["effoysira.com"] };
    expect(chooseSourceUrl(effoy, { ...post, buttons: [], links: ["https://effoysira.com/abc/"] })).toBe("https://effoysira.com/abc/");
    expect(chooseSourceUrl(effoy, { ...post, buttons: [], links: [] })).toBe("https://t.me/effoyjobs/16453");
  });
});

describe("helpers", () => {
  it("recognises job boards", () => {
    expect(isJobBoardUrl("https://www.geezjobs.com/job-detail/x")).toBe(true);
    expect(isJobBoardUrl("https://careers.ethiopianairlines.com/apply")).toBe(false);
  });

  it("ranks apply methods", () => {
    expect(applyRank("url")).toBeLessThan(applyRank("email"));
    expect(applyRank("email")).toBeLessThan(applyRank("source"));
  });

  it("builds readable slugs", () => {
    expect(jobSlug("Junior Accountant", "Kerchanshe Trading PLC", "a1b2c3d4-0000")).toBe("junior-accountant-kerchanshe-trading-plc-a1b2c3");
  });
});

describe("employerType", () => {
  it("keeps the extracted type, and fixes it for sources that are one employer kind", () => {
    expect(normalizeJob(job({ employer_type: "ngo" }), { source, post, taxonomy, now: NOW })!.employerType).toBe("ngo");
    const au = { ...source, id: "african_union" };
    expect(normalizeJob(job({ employer_type: "local_private" }), { source: au, post, taxonomy, now: NOW })!.employerType).toBe("international_org");
    const rw = { ...source, id: "reliefweb" };
    expect(normalizeJob(job({ employer_type: null }), { source: rw, post, taxonomy, now: NOW })!.employerType).toBe("ngo");
    expect(normalizeJob(job({ employer_type: "foreign_company" }), { source: rw, post, taxonomy, now: NOW })!.employerType).toBe("foreign_company");
  });
});
