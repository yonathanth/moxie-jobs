import { describe, expect, it } from "vitest";
import { hirerPhrase, jobKindLabel, kindMatchPreview, missedDigest, overLimitPreview, previewSentence, startOfDayEat } from "../src/previews";

const links = { app: "https://jobs.example.app", bot: "https://t.me/gurshajobsbot" };
const job = {
  id: "j1",
  title: "Junior Software Engineer",
  hirer: "A company",
  jobType: "part-time",
  workMode: "remote",
  brief: "design, develop and maintain web-based applications and internal tools",
  location: "Addis Ababa",
  deadline: new Date("2026-12-05T09:00:00Z"),
  salary: "25,000 Br",
};
const proButton = [[{ text: "Get Pro to see details", web_app: { url: "https://jobs.example.app/app/plans" } }]];
const proLink = `<b><a href="https://t.me/gurshajobsbot?startapp=plans">Subscribe to Pro</a></b> to see who's hiring and apply.`;

describe("previews", () => {
  it("names who is hiring without naming them, one kind at a time", () => {
    expect(hirerPhrase({ employerType: "ngo", isOverseas: false })).toBe("An NGO");
    expect(hirerPhrase({ employerType: "international_org", isOverseas: false })).toBe("An international organization");
    expect(hirerPhrase({ employerType: "embassy", isOverseas: false })).toBe("An embassy");
    expect(hirerPhrase({ employerType: "local_private", isOverseas: true, country: "Qatar" })).toBe("An employer in Qatar");
    expect(hirerPhrase({ employerType: "local_private", isOverseas: false })).toBe("A company");
    expect(jobKindLabel({ employerType: "embassy", isOverseas: false })).toBe("embassy job");
    expect(jobKindLabel({ employerType: "local_private", isOverseas: false })).toBeNull();
  });

  it("the sentence: what they'd do, or just who is looking for whom", () => {
    expect(previewSentence(job)).toBe(
      "A company is hiring a part-time remote Junior Software Engineer to design, develop and maintain web-based applications and internal tools.",
    );
    expect(previewSentence({ ...job, hirer: "An NGO", jobType: null, workMode: null, brief: null, title: "Accountant" })).toBe("An NGO is looking for an Accountant.");
  });

  it("over-limit preview: title, sentence, facts, each with a blank line between; one link and one button", () => {
    const p = overLimitPreview(job, 5, links);
    expect(p.text.split("\n")).toEqual([
      "<b>New match: Junior Software Engineer</b>",
      "",
      "A company is hiring a part-time remote Junior Software Engineer to design, develop and maintain web-based applications and internal tools.",
      "",
      "Addis Ababa · apply by 5 Dec · Salary: 25,000 Br",
      "",
      "You've reached your 5 free jobs for today.",
      proLink,
    ]);
    expect(p.text.match(/<a /g)).toHaveLength(1);
    expect(p.buttons).toEqual(proButton);
  });

  it("NGO and other kinds: the specific kind is for Pro members; never says premium", () => {
    const p = kindMatchPreview({ ...job, hirer: "An embassy", employerType: "embassy", isOverseas: false }, links);
    expect(p.caption).toContain("An embassy is hiring a part-time remote Junior Software Engineer");
    expect(p.caption).toContain(`Embassy jobs are for Pro members.\n${proLink}`);
    expect(p.caption.toLowerCase()).not.toContain("premium");
    expect(p.buttons).toEqual(proButton);
    expect(p.image).toBe("/og/msg/premium?job=j1");
  });

  it("leaves out the facts line when nothing is known, and works without links (local dev)", () => {
    const p = overLimitPreview({ id: "j2", title: "Driver", hirer: "A company", location: null, deadline: null }, 5, { app: null, bot: null });
    expect(p.text.split("\n").slice(0, 4)).toEqual(["<b>New match: Driver</b>", "", "A company is looking for a Driver.", ""]);
    expect(p.text).not.toContain("<a ");
    expect(p.buttons).toEqual([]);
  });

  it("missed digest: at most 10, the rest counted, under the caption limit", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ title: `Very long job title number ${i} for a senior role in finance and admin`, who: "Some International Organisation" }));
    const d = missedDigest(many, 14, 5, links)!;
    expect(d.caption).toContain("<b>You missed 14 matching jobs yesterday</b>");
    expect(d.caption.replace(/<[^>]+>/g, "").length).toBeLessThanOrEqual(1000);
    expect(d.caption).toMatch(/…and \d+ more\./);
    expect(d.caption).toContain("not just 5 a day");
    expect(d.buttons[0]!.map((b) => b.text)).toEqual(["See jobs", "Get Pro"]);
    expect(d.image).toBe("/og/msg/missed?n=14");
    expect(missedDigest([], 0, 5, links)).toBeNull();
  });

  it("start of day is Addis Ababa midnight", () => {
    expect(startOfDayEat(new Date("2026-11-27T22:30:00Z")).toISOString()).toBe("2026-11-27T21:00:00.000Z");
  });
});

describe("versionedCardUrl", () => {
  it("adds the picture version so Telegram fetches new pictures", async () => {
    const { versionedCardUrl, CARD_VERSION } = await import("../src/promos");
    expect(versionedCardUrl("/og/msg/avatar", "https://x.app/")).toBe(`https://x.app/og/msg/avatar?v=${CARD_VERSION}`);
    expect(versionedCardUrl("/og/msg/upgrade?price=199", "https://x.app")).toBe(`https://x.app/og/msg/upgrade?price=199&v=${CARD_VERSION}`);
    expect(versionedCardUrl("https://x.app/j/1/share.jpg", "https://other")).toBe(`https://x.app/j/1/share.jpg?v=${CARD_VERSION}`);
  });
});
