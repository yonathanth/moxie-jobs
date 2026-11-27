import { describe, expect, it } from "vitest";
import { jobKindLabel, kindMatchPreview, missedDigest, overLimitPreview, startOfDayEat } from "../src/previews";

const links = { app: "https://jobs.example.app", bot: "https://t.me/meklitbot" };
const job = { id: "j1", title: "Finance Officer", employerLabel: "NGO", location: "Addis Ababa", deadline: new Date("2026-12-05T09:00:00Z") };

describe("previews", () => {
  it("never says premium; names the kind of job", () => {
    expect(jobKindLabel({ employerType: "ngo", isOverseas: false })).toBe("NGO job");
    expect(jobKindLabel({ employerType: "embassy", isOverseas: false })).toBe("UN, AU or embassy job");
    expect(jobKindLabel({ employerType: "local_private", isOverseas: true })).toBe("job abroad");
    expect(jobKindLabel({ employerType: "local_private", isOverseas: false })).toBeNull();
    const p = kindMatchPreview({ ...job, employerType: "ngo", isOverseas: false }, links);
    expect(p.caption).toContain("<b>New NGO job for you</b>");
    expect(p.caption.toLowerCase()).not.toContain("premium");
    expect(p.image).toBe("/og/msg/premium?job=j1");
  });

  it("over-limit preview: links in the text and side-by-side buttons", () => {
    const p = overLimitPreview(job, 5, links);
    expect(p.text).toContain("You've had your 5 free job alerts for today");
    expect(p.text).toContain('<a href="https://t.me/meklitbot?startapp=plans">Get Pro</a>');
    expect(p.text).toContain('<a href="https://t.me/meklitbot?startapp=job_j1">open it in the app</a>');
    expect(p.buttons).toEqual([
      [
        { text: "See job", web_app: { url: "https://jobs.example.app/app/jobs/j1" } },
        { text: "Get Pro", web_app: { url: "https://jobs.example.app/app/plans" } },
      ],
    ]);
  });

  it("works without links (local dev)", () => {
    const p = overLimitPreview(job, 5, { app: null, bot: null });
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
