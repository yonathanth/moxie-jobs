import { describe, expect, it } from "vitest";
import { parseExtraction } from "../src/ai/schema";
import { taxonomyBlock, userMessage } from "../src/ai/prompt";
import { extractMainText, pickPageUrl } from "../src/pipeline/enrich";

describe("parseExtraction", () => {
  it("accepts fenced JSON and tolerates bad values", () => {
    const out = parseExtraction(
      '```json\n{"is_job_post": true, "reject_reason": null, "jobs": [{"title": "Driver", "summary": "x", "education_level": "wizard", "experience_min_years": "3 years", "gender": "?", "apply": {"method": "carrier pigeon"}}]}\n```',
    );
    const job = out.jobs[0];
    expect(job.title).toBe("Driver");
    expect(job.education_level).toBeNull();
    expect(job.experience_min_years).toBe(3);
    expect(job.gender).toBe("any");
    expect(job.apply.method).toBe("source");
    expect(job.city_ids).toEqual([]);
  });

  it("throws on non-JSON", () => {
    expect(() => parseExtraction("Sorry, I can't")).toThrow();
  });
});

describe("prompt building", () => {
  it("lists taxonomy ids with aliases and function", () => {
    const block = taxonomyBlock({
      functions: [{ id: "health", name: "Health" }],
      professions: [{ id: "nurse", name: "Nurse", functionId: "health", aliases: ["ነርስ"] }],
      fields: [{ id: "nursing", name: "Nursing", aliases: [] }],
    });
    expect(block).toContain("nurse: Nurse | ነርስ [health]");
    expect(block).toContain("nursing: Nursing");
    expect(block).toContain("addis_ababa: Addis Ababa");
  });

  it("includes buttons and page text in the user message", () => {
    const msg = userMessage({
      postedAtEat: "2026-11-19 14:05 (Thursday)",
      sourceTitle: "HaHuJobs",
      sourceType: "original",
      text: "Nurse wanted",
      buttons: [{ text: "Apply", url: "https://x.et/apply" }],
      pageText: null,
    });
    expect(msg).toContain("- Apply: https://x.et/apply");
    expect(msg).toContain("LINKED PAGE:\n(none)");
  });
});

describe("enrichment helpers", () => {
  it("picks only links on the source's domains", () => {
    expect(pickPageUrl(["https://t.me/x", "https://www.effoysira.com/a/"], ["effoysira.com"])).toBe("https://www.effoysira.com/a/");
    expect(pickPageUrl(["https://evil.com/effoysira.com"], ["effoysira.com"])).toBeNull();
  });

  it("extracts the main article text", () => {
    const body = "Duties: prepare financial statements. ".repeat(10);
    const html = `<html><body><nav>Menu Home Jobs</nav><article><h1>Accountant</h1><p>${body}</p></article><footer>© site</footer><script>x()</script></body></html>`;
    const text = extractMainText(html);
    expect(text.startsWith("Accountant Duties")).toBe(true);
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("x()");
  });
});
