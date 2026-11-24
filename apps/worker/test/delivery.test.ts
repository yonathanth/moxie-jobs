import { describe, expect, it } from "vitest";
import { buildCard, type CardJob } from "../src/delivery/card";
import { DEFAULT_PLAN_LIMITS } from "@ethio/shared";
import { deliveryState } from "../src/delivery/matcher";
import { sendTimeAfterQuiet, startOfDayEat, todayAtEat } from "../src/delivery/schedule";
import { digestText } from "../src/delivery/teaser";
import { nudgeText } from "../src/delivery/nudge";

// EAT = UTC+3
const eat = (iso: string) => new Date(`${iso}+03:00`);

describe("schedule helpers", () => {
  it("finds EAT midnight and today's teaser hour", () => {
    expect(startOfDayEat(eat("2026-11-19T01:30:00")).toISOString()).toBe("2026-11-18T21:00:00.000Z");
    expect(todayAtEat(eat("2026-11-19T10:00:00"), 18).toISOString()).toBe(eat("2026-11-19T18:00:00").toISOString());
  });
});

describe("quiet hours (22:00–07:00 Addis Ababa)", () => {
  const at = (iso: string) => sendTimeAfterQuiet(eat(iso), 22, 7).toISOString();
  it("sends right away during the day", () => {
    expect(at("2026-11-19T10:00:00")).toBe(eat("2026-11-19T10:00:00").toISOString());
    expect(at("2026-11-19T21:59:00")).toBe(eat("2026-11-19T21:59:00").toISOString());
  });
  it("holds late-evening matches until 07:00 the next day", () => {
    expect(at("2026-11-19T22:00:00")).toBe(eat("2026-11-20T07:00:00").toISOString());
    expect(at("2026-11-19T23:45:00")).toBe(eat("2026-11-20T07:00:00").toISOString());
  });
  it("holds after-midnight matches until 07:00 the same day", () => {
    expect(at("2026-11-20T02:30:00")).toBe(eat("2026-11-20T07:00:00").toISOString());
    expect(at("2026-11-20T07:00:00")).toBe(eat("2026-11-20T07:00:00").toISOString());
  });
  it("is off when from equals to", () => {
    expect(sendTimeAfterQuiet(eat("2026-11-20T02:30:00"), 0, 0).toISOString()).toBe(eat("2026-11-20T02:30:00").toISOString());
  });
});

describe("deliveryState", () => {
  const ngo = { employerType: "ngo", isOverseas: false };
  const local = { employerType: "local_private", isOverseas: false };
  const abroad = { employerType: "local_private", isOverseas: true };
  it("locks premium jobs for free users", () => {
    expect(deliveryState(ngo, DEFAULT_PLAN_LIMITS.free).status).toBe("locked");
    expect(deliveryState(abroad, DEFAULT_PLAN_LIMITS.free).status).toBe("locked");
    expect(deliveryState({ employerType: "embassy", isOverseas: false }, DEFAULT_PLAN_LIMITS.free).status).toBe("locked");
  });
  it("sends local jobs to everyone and premium jobs to paid plans", () => {
    expect(deliveryState(local, DEFAULT_PLAN_LIMITS.free)).toEqual({ status: "pending", mode: "instant" });
    expect(deliveryState(ngo, DEFAULT_PLAN_LIMITS.pro).status).toBe("pending");
    expect(deliveryState({ employerType: null, isOverseas: false }, DEFAULT_PLAN_LIMITS.free).status).toBe("pending");
  });
});

const PRO = { premiumJobs: true, dailyJobCap: null };

describe("digestText", () => {
  it("describes Pro from its live limits", () => {
    const one = { waiting: 1, dailyCap: 10, ngo: 0, intl: 0, foreign: 0, overseas: 0 };
    expect(digestText(one, PRO)).toContain("Pro sends every match the moment it's posted, with no daily limit, including NGO, international and overseas jobs.");
    expect(digestText(one, { premiumJobs: false, dailyJobCap: 50 })).toContain("Pro sends every match the moment it's posted, up to 50 a day.");
  });

  const none = { waiting: 0, dailyCap: 10, ngo: 0, intl: 0, foreign: 0, overseas: 0 };
  it("says nothing when nothing was held back", () => {
    expect(digestText(none, PRO)).toBeNull();
  });
  it("reports matches over the daily limit", () => {
    const text = digestText({ ...none, waiting: 4 }, PRO)!;
    expect(text).toContain("You've had your 10 free alerts today. <b>4 more matches are waiting</b> in your feed.");
    expect(text).not.toContain("premium");
  });
  it("reports premium matches by kind, with plurals", () => {
    const text = digestText({ ...none, ngo: 3, intl: 1, overseas: 2 }, PRO)!;
    expect(text).toContain("<b>6 premium jobs</b> also matched you: 3 NGO jobs, 1 UN, AU or embassy job, 2 jobs abroad.");
    expect(text).not.toContain("waiting");
  });
  it("combines both in one message", () => {
    const text = digestText({ ...none, waiting: 1, ngo: 1 }, PRO)!;
    expect(text).toContain("<b>1 more match is waiting</b>");
    expect(text).toContain("<b>1 premium job</b> also matched you: 1 NGO job.");
  });
});

const job = (o: Partial<CardJob> = {}): CardJob => ({
  id: "job-1",
  title: "Senior Accountant",
  company: "Kerchanshe <Trading>",
  employerType: "local_private",
  summary: "Kerchanshe is hiring two senior accountants.",
  locationIds: ["jimma", "batu"],
  locationRaw: null,
  workMode: "onsite",
  isOverseas: false,
  country: null,
  experienceMin: 5,
  experienceMax: null,
  educationLevel: "bachelor",
  employmentType: "contract",
  positions: 2,
  salaryRaw: null,
  genderReq: "any",
  deadline: eat("2026-11-22T23:59:59"),
  firstSeenAt: eat("2026-11-19T08:20:00"),
  applyMethod: "source",
  applyUrl: null,
  applyEmail: null,
  applyTelegram: null,
  applyPhone: null,
  applyNotes: null,
  sourceUrl: "https://t.me/ethiojobs_netbot?startapp=job_id_1",
  ...o,
});

describe("buildCard", () => {
  const now = eat("2026-11-19T10:00:00");
  const opts = { sourceTitle: "Ethiojobs", deliveryId: "d-1", now };

  it("renders labelled facts with a blank line between each, escaped, no emoji", () => {
    const { text } = buildCard(job(), { ...opts, fieldNames: ["Accounting", "Finance"] });
    expect(text).toContain("<b>Senior Accountant</b>\nKerchanshe &lt;Trading&gt;\n\n<b>Location:</b> Jimma, Batu\n\n<b>Experience:</b> 5+ years");
    expect(text).toContain("<b>Education:</b> Bachelor's degree in Accounting, Finance");
    expect(text).toContain("<b>Job type:</b> Contract · 2 positions");
    expect(text).toContain("<b>Deadline:</b> Nov 22 (4 days left)");
    expect(text).toContain("<i>via Ethiojobs</i>");
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("local dev (http): See details and More jobs fall back to callbacks", () => {
    const { buttons } = buildCard(job(), opts);
    expect(buttons).toEqual([
      [
        { text: "See details", callback_data: "ap:d-1" },
        { text: "More jobs", callback_data: "mj" },
      ],
    ]);
  });

  it("on https: two Mini App buttons, the job page and the For you feed", () => {
    const { buttons } = buildCard(job(), { ...opts, webAppUrl: "https://jobs.gomoxie.app", publicApiUrl: "https://api.jobs.gomoxie.app" });
    expect(buttons).toEqual([
      [
        { text: "See details", web_app: { url: "https://jobs.gomoxie.app/app/jobs/job-1" } },
        { text: "More jobs", web_app: { url: "https://jobs.gomoxie.app/app/jobs?scope=for_you" } },
      ],
    ]);
  });

  it("leaves how to apply out (it is on the job page and in See details)", () => {
    expect(buildCard(job({ applyMethod: "email", applyEmail: "hr@x.com" }), opts).text).not.toContain("How to apply");
    expect(buildCard(job({ applyMethod: "email", applyEmail: "hr@x.com" }), opts).text).not.toContain("hr@x.com");
  });

  it("leaves requirements out (they are on the job page)", () => {
    const { text } = buildCard(job({ requirements: ["BA in Accounting", "5+ years audit"] }), opts);
    expect(text).not.toContain("Requirements");
    expect(text).not.toContain("BA in Accounting");
  });

  it("labels the employer type and says what the post didn't state", () => {
    const { text } = buildCard(job({ employerType: "ngo", experienceMin: null, educationLevel: null, deadline: null }), opts);
    expect(text).toContain("Kerchanshe &lt;Trading&gt; · NGO");
    expect(text).toContain("<i>Not stated: experience, education, deadline</i>\n<i>via Ethiojobs</i>");
    expect(text).not.toContain("<b>Deadline:</b>");
  });

  it("shows gender, abroad, hybrid and only salaries with figures", () => {
    const text = buildCard(job({ genderReq: "female", isOverseas: true, country: "Qatar", salaryRaw: "Attractive" }), opts).text;
    expect(text).toContain("<b>Gender:</b> Female applicants only");
    expect(text).toContain("<b>Location:</b> Abroad: Qatar");
    expect(text).not.toContain("Salary");
    expect(buildCard(job({ workMode: "hybrid" }), opts).text).toContain("<b>Location:</b> Jimma, Batu (Hybrid)");
    expect(buildCard(job({ salaryRaw: "ETB 22,000 gross" }), opts).text).toContain("<b>Salary:</b> ETB 22,000 gross");
  });
});

describe("nudgeText", () => {
  it("reminds once, by name, without emoji or HTML injection", () => {
    const t = nudgeText("Abebe<b>");
    expect(t).toContain("<b>Your job alerts aren't set up yet, Abebeb</b>");
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("unpaid roles", () => {
  it("are labelled on the card", async () => {
    const { buildCard } = await import("../src/delivery/card");
    const base = {
      id: "j", title: "Intern", company: null, employerType: null, summary: "s", locationIds: [], locationRaw: null, workMode: null,
      isOverseas: false, country: null, experienceMin: null, experienceMax: null, educationLevel: null, employmentType: "internship",
      positions: null, salaryRaw: "Attractive", genderReq: "any", deadline: null, firstSeenAt: new Date(), applyMethod: "source",
      applyUrl: null, applyEmail: null, applyTelegram: null, applyPhone: null, applyNotes: null, sourceUrl: "https://t.me/x/1",
    };
    expect(buildCard({ ...base, qualityFlags: ["unpaid"] }, { sourceTitle: "X", deliveryId: "d" }).text).toContain("<b>Salary:</b> Unpaid");
    expect(buildCard(base, { sourceTitle: "X", deliveryId: "d" }).text).not.toContain("Salary");
  });
});
