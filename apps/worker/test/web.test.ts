import { describe, expect, it } from "vitest";
import { parseAuJobPage, parseAuSitemap } from "../src/web/african-union";
import { reliefwebRequestBody, reliefwebToItem } from "../src/web/reliefweb";
import { clampText, MAX_ITEM_TEXT } from "../src/web/types";

describe("reliefweb", () => {
  it("asks for Ethiopia jobs from the last 3 days, newest first", () => {
    const body = reliefwebRequestBody(new Date("2026-11-21T12:00:00Z"));
    expect(body.filter.conditions).toEqual([
      { field: "country.iso3", value: "ETH" },
      { field: "date.created", value: { from: "2026-11-18T12:00:00.000Z" } },
    ]);
    expect(body.sort).toEqual(["date.created:desc"]);
    expect(body.limit).toBeLessThanOrEqual(1000);
  });

  it("maps an API record to an item that links back to ReliefWeb", () => {
    const item = reliefwebToItem({
      id: 4123456,
      fields: {
        title: "WASH Officer",
        body: "Lead WASH activities in Gambella.\n\nRequirements: BSc in Civil Engineering, 3 years.",
        how_to_apply: "Apply via https://careers.example.org/123",
        date: { created: "2026-11-20T08:00:00+00:00", closing: "2026-12-05T00:00:00+00:00" },
        source: [{ name: "International Rescue Committee" }],
        country: [{ name: "Ethiopia" }],
        city: [{ name: "Gambela" }],
        type: [{ name: "Job" }],
        career_categories: [{ name: "Program/Project Management" }],
        experience: [{ name: "3-4 years" }],
        url: "https://reliefweb.int/node/4123456",
        url_alias: "https://reliefweb.int/job/4123456/wash-officer",
      },
    });
    expect(item).not.toBeNull();
    expect(item!.externalId).toBe(4123456n);
    expect(item!.url).toBe("https://reliefweb.int/job/4123456/wash-officer");
    expect(item!.postedAt.toISOString()).toBe("2026-11-20T08:00:00.000Z");
    expect(item!.text).toContain("Organization: International Rescue Committee");
    expect(item!.text).toContain("Location: Gambela, Ethiopia");
    expect(item!.text).toContain("Closing date: 2026-12-05");
    expect(item!.text).toContain("How to apply:\nApply via https://careers.example.org/123");
  });

  it("tolerates single-object reference fields and missing optional fields", () => {
    const item = reliefwebToItem({ id: "77", fields: { title: "Driver", source: { name: "UNICEF" } } });
    expect(item!.text).toContain("Organization: UNICEF");
    expect(item!.url).toBe("https://reliefweb.int/job/77");
  });

  it("skips records without a title or numeric id", () => {
    expect(reliefwebToItem({ id: 1, fields: {} })).toBeNull();
    expect(reliefwebToItem({ id: "abc", fields: { title: "X" } })).toBeNull();
  });
});

describe("african union", () => {
  const sitemap = `<?xml version="1.0"?><urlset>
    <url><loc>https://jobs.au.int/job/Addis-Ababa-Assistant-Accountant-FMD/1377799857/</loc><lastmod>2026-11-14</lastmod></url>
    <url><loc>https://jobs.au.int/job/Addis-Ababa-Assistant-Accountant-FMD/1377799857/</loc><lastmod>2026-11-14</lastmod></url>
    <url><loc>https://jobs.au.int/go/All-Jobs/9831757/</loc></url>
    <url><loc>https://jobs.au.int/job/Addis-Ababa-Programme-de-stages/765006802/</loc></url>
  </urlset>`;

  it("reads job ids and dates from the sitemap, once each, ignoring non-job pages", () => {
    const listings = parseAuSitemap(sitemap);
    expect(listings.map((l) => l.externalId)).toEqual([1377799857n, 765006802n]);
    expect(listings[0]!.postedAt?.toISOString()).toBe("2026-11-14T00:00:00.000Z");
    expect(listings[1]!.postedAt).toBeNull();
  });

  const page = `<html><body>
    <h1 itemprop="title">Assistant Accountant - FMD</h1>
    <span itemprop="description">short</span>
    <div itemprop="description"><p>Location: Addis Ababa, Ethiopia</p><p>Purpose of Job</p>
      <ul><li>Process education allowance claims accurately and on time, following AU Financial Rules.</li>
      <li>Deadline for application: 05 December 2026</li></ul></div>
    <script>var x = 1;</script></body></html>`;

  it("extracts the title and the longest description from an English job page", () => {
    const parsed = parseAuJobPage(page, "https://jobs.au.int/job/Addis-Ababa-Assistant-Accountant-FMD/3138-en_US/");
    expect(parsed?.title).toBe("Assistant Accountant - FMD");
    expect(parsed?.text).toContain("Location: Addis Ababa, Ethiopia\nPurpose of Job\n");
    expect(parsed?.text).toContain("Deadline for application: 05 December 2026");
    expect(parsed?.text).not.toContain("var x");
  });

  it("skips other-language versions of a vacancy", () => {
    expect(parseAuJobPage(page, "https://jobs.au.int/job/Addis-Ababa-Comptable/3139-fr_FR/")).toBeNull();
  });
});

describe("clampText", () => {
  it("collapses blank runs and caps length", () => {
    expect(clampText("a\n\n\n\nb")).toBe("a\n\nb");
    expect(clampText("x".repeat(MAX_ITEM_TEXT + 50)).length).toBe(MAX_ITEM_TEXT + 1);
  });
});
