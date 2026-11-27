import { describe, expect, it } from "vitest";
import { jobKindLabel, kindMatchPreview, missedDigest, overLimitPreview, startOfDayEat } from "../src/previews";

const links = { app: "https://jobs.example.app", bot: "https://t.me/gurshajobsbot" };
const job = {
  id: "j1",
  title: "Finance Officer",
  location: "Addis Ababa",
  deadline: new Date("2026-12-05T09:00:00Z"),
  jobType: "Full-time",
  experience: "3+ years",
  education: "Bachelor's degree in Accounting",
  salary: "25,000–30,000 Br/month",
  openings: 2,
};
const proButton = [[{ text: "Get Pro to see details", web_app: { url: "https://jobs.example.app/app/plans" } }]];

describe("previews", () => {
  it("never says premium; names who is hiring without naming them", () => {
    expect(jobKindLabel({ employerType: "ngo", isOverseas: false })).toBe("NGO job");
    expect(jobKindLabel({ employerType: "embassy", isOverseas: false })).toBe("UN, AU or embassy job");
    expect(jobKindLabel({ employerType: "local_private", isOverseas: true })).toBe("job abroad");
    expect(jobKindLabel({ employerType: "local_private", isOverseas: false })).toBeNull();
    const p = kindMatchPreview({ ...job, employerType: "ngo", isOverseas: false }, links);
    expect(p.caption).toContain("<b>An NGO is hiring: Finance Officer</b>");
    expect(p.caption).toContain("NGO jobs are for Pro members.");
    expect(p.caption).toContain(`<a href="https://t.me/gurshajobsbot?startapp=plans">Subscribe to Pro</a> to see who's hiring and apply.`);
    expect(p.caption.toLowerCase()).not.toContain("premium");
    expect(p.buttons).toEqual(proButton);
    expect(p.image).toBe("/og/msg/premium?job=j1");
    expect(kindMatchPreview({ ...job, employerType: "embassy", isOverseas: false }, links).caption).toContain("A UN, AU or embassy office is hiring");
  });

  it("over-limit preview: New match, the facts, one link and one button", () => {
    const p = overLimitPreview(job, 5, links);
    expect(p.text.split("\n")).toEqual([
      "<b>New match: Finance Officer</b>",
      "Addis Ababa · Full-time · apply by 5 Dec",
      "3+ years · Bachelor's degree in Accounting",
      "Salary: 25,000–30,000 Br/month · 2 openings",
      "",
      "You've reached your 5 free jobs for today.",
      `<a href="https://t.me/gurshajobsbot?startapp=plans">Subscribe to Pro</a> to see who's hiring and apply.`,
    ]);
    expect(p.text.match(/<a /g)).toHaveLength(1);
    expect(p.buttons).toEqual(proButton);
  });

  it("leaves out facts that are not stated, and works without links (local dev)", () => {
    const p = overLimitPreview({ id: "j2", title: "Driver", location: null, deadline: null }, 5, { app: null, bot: null });
    expect(p.text.split("\n")[1]).toBe("");
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
