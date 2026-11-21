import { describe, expect, it } from "vitest";
import type { Job } from "@ethio/db";
import { applyPrompt, cvTailorPrompt, planPerks } from "../src/bot/bot.messages";
import { decodeCursor, employerTypes, encodeCursor, searchTerms, toCard } from "../src/jobs/jobs.mapper";

const job = (o: Partial<Job> = {}): Job =>
  ({
    id: "0a2188b4-a7a6-48b7-a426-77f0db9c5883",
    slug: "x",
    title: "Program Officer",
    rawTitle: "Program Officer",
    company: "Save the Children",
    companyKey: "save children",
    employerType: "ngo",
    professionId: null,
    functionId: "ngo_development",
    fieldOfStudyIds: ["economics"],
    educationLevel: "bachelor",
    experienceMin: 3,
    experienceMax: null,
    employmentType: "full_time",
    workMode: "onsite",
    locationIds: ["addis_ababa"],
    locationRaw: null,
    isOverseas: false,
    country: null,
    positions: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    salaryRaw: "Attractive",
    genderReq: "any",
    deadline: new Date("2026-12-01T20:59:59Z"),
    deadlineRaw: null,
    summary: "Save the Children is hiring a Program Officer.",
    skills: ["Excel"],
    applyMethod: "email",
    applyUrl: null,
    applyEmail: "jobs@stc.org",
    applyTelegram: null,
    applyPhone: null,
    applyNotes: null,
    primarySourceId: "reliefweb",
    sourceUrl: "https://reliefweb.int/job/1",
    qualityFlags: [],
    status: "active",
    firstSeenAt: new Date("2026-11-20T08:00:00Z"),
    updatedAt: new Date(),
    ...o,
  }) as Job;

const ctx = {
  match: null,
  fieldNames: new Map([["economics", "Economics"]]),
  sourceTitles: new Map([["reliefweb", "ReliefWeb"]]),
};

describe("toCard", () => {
  it("gives paid plans the full job", () => {
    const c = toCard(job(), { ...ctx, premiumJobs: true });
    expect(c.locked).toBe(false);
    expect(c).toMatchObject({
      company: "Save the Children",
      employerLabel: "NGO",
      location: "Addis Ababa",
      experience: "3+ years",
      education: "Bachelor's degree in Economics",
      salary: null,
      sourceTitle: "ReliefWeb",
      apply: { url: "https://reliefweb.int/job/1", label: "View job", how: "Send your CV to jobs@stc.org" },
    });
  });

  it("redacts premium jobs for free users: no company, summary or way to apply", () => {
    const c = toCard(job(), { ...ctx, premiumJobs: false });
    expect(c.locked).toBe(true);
    expect(c.title).toBe("Program Officer");
    expect(c.employerLabel).toBe("NGO");
    expect(c.company).toBeNull();
    expect(c.summary).toBeNull();
    expect(c.apply).toBeNull();
    expect(c.sourceUrl).toBeNull();
  });

  it("leaves local jobs open on the free plan", () => {
    expect(toCard(job({ employerType: "local_private" }), { ...ctx, premiumJobs: false }).locked).toBe(false);
  });
});

describe("cursors", () => {
  it("round-trips and rejects junk", () => {
    const at = new Date("2026-11-20T08:00:00.000Z");
    const id = "0a2188b4-a7a6-48b7-a426-77f0db9c5883";
    expect(decodeCursor(encodeCursor(at, id))).toEqual({ at, id });
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });
});

describe("search and filters", () => {
  it("splits search into up to 5 words of 2+ chars", () => {
    expect(searchTerms("  Senior   Accountant, Addis! ")).toEqual(["senior", "accountant", "addis"]);
    expect(searchTerms("a b c")).toEqual([]);
    expect(searchTerms("c# .net node.js")).toEqual(["c#", ".net", "node.js"]);
  });
  it("maps employer chips to stored types", () => {
    expect(employerTypes(["international", "ngo"]).sort()).toEqual(["embassy", "international_org", "ngo"]);
  });
});

describe("bot replies", () => {
  it("old Apply buttons answer with the direct link, no CV question", () => {
    const r = applyPrompt({ title: "Accountant", closed: false, how: "Send your CV to hr@x.com", applyUrl: "https://x.com/apply", applyLabel: "Apply" });
    expect(r.text).not.toContain("CV tailored");
    expect(r.text).toContain("<b>How to apply:</b> Send your CV to hr@x.com");
    expect(r.reply_markup?.inline_keyboard).toEqual([[{ text: "Apply", url: "https://x.com/apply" }]]);
  });
  it("says when the job has closed", () => {
    expect(applyPrompt({ title: "A", closed: true, how: null, applyUrl: null, applyLabel: "Apply" }).text).toContain("This job has closed");
  });
  it("CV button opens the tailoring flow in the Mini App on https", () => {
    const r = cvTailorPrompt("Accountant", "j1", "https://jobs.gomoxie.app");
    expect(r.text).toContain("first one is free");
    expect(r.reply_markup?.inline_keyboard).toEqual([[{ text: "Tailor my CV", web_app: { url: "https://jobs.gomoxie.app/app/cvs/new?mode=tailor&jobId=j1" } }]]);
  });
});

describe("planPerks", () => {
  it("follows the plan's live limits", () => {
    expect(planPerks({ premiumJobs: true, dailyJobCap: null })).toBe("Matching jobs, including NGO, international and overseas ones, now arrive instantly, with no daily limit.");
    expect(planPerks({ premiumJobs: false, dailyJobCap: 30 })).toBe("Matching jobs now arrive instantly, up to 30 a day.");
  });
});
