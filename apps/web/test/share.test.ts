import { describe, expect, it } from "vitest";
import { jobShareText } from "../src/lib/share";

const job = { title: "Program Officer", company: "UNICEF", employerLabel: "UN / AU / Embassy", premium: true, location: "Addis Ababa", deadline: null };

describe("jobShareText", () => {
  it("never names the employer of a premium job", () => {
    const text = jobShareText(job);
    expect(text).toContain("Program Officer at UN / AU / Embassy");
    expect(text).not.toContain("UNICEF");
  });
  it("names the company of a regular job", () => {
    expect(jobShareText({ ...job, premium: false, company: "Ethio Telecom", employerLabel: null })).toContain("Program Officer at Ethio Telecom");
  });
});
