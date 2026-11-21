import { describe, expect, it } from "vitest";
import { companyKey, normalizeText, prefilter, textHash, titleSimilarity } from "../src/pipeline/text";

describe("normalizeText / textHash", () => {
  it("ignores links, handles, emojis and spacing", () => {
    const a = "🔥 Accountant at ABC PLC\nApply: https://x.com/a  @effoyjobs";
    const b = "Accountant at ABC PLC Apply: https://other.link/b";
    expect(normalizeText(a)).toBe("accountant at abc plc apply");
    expect(textHash(a)).toBe(textHash(b));
  });

  it("keeps Amharic letters", () => {
    expect(normalizeText("ክፍት የስራ ቦታ!!")).toBe("ክፍት የስራ ቦታ");
  });
});

describe("prefilter", () => {
  it("skips very short posts", () => {
    expect(prefilter("Join us 👉 @channel")).toBe("too_short");
  });

  it("skips obvious non-job posts without vacancy words", () => {
    expect(prefilter("Fully funded scholarship to study in Germany for the 2027 intake, all levels welcome now")).toBe("not_job");
    expect(prefilter("Make money online and earn 3000 birr per day from your phone, simple tasks for everyone")).toBe("not_job");
  });

  it("lets real vacancies through, even if they mention training", () => {
    expect(prefilter("Vacancy: Training Officer at XYZ PLC. Deadline Nov 30. BA in Management with 2 years of experience")).toBeNull();
    expect(prefilter("ክፍት የስራ ቦታ ማስታወቂያ: አካውንታንት፣ የትምህርት ደረጃ ዲግሪ፣ የስራ ልምድ 2 ዓመት")).toBeNull();
  });
});

describe("titleSimilarity", () => {
  it("is high for reworded copies and low for different roles", () => {
    expect(titleSimilarity("Senior Accountant", "Accountant (Re-advert)")).toBe(1);
    expect(titleSimilarity("Sales Executive - Protective Coatings", "Protective Coatings Sales Executive")).toBe(1);
    expect(titleSimilarity("Accountant", "Driver")).toBe(0);
  });
});

describe("companyKey", () => {
  it("strips legal suffixes and noise", () => {
    expect(companyKey("Kerchanshe Trading PLC")).toBe("kerchanshe trading");
    expect(companyKey("Kerchanshe Trading P.L.C.")).toBe("kerchanshe trading");
    expect(companyKey("Huawei Technologies Ethiopia PLC")).toBe("huawei technologies");
    expect(companyKey(null)).toBeNull();
  });
});

import { sameCompany } from "../src/pipeline/text";

describe("sameCompany", () => {
  it("matches transliteration and word-order variants", () => {
    expect(sameCompany("Birhan Insurance SC", "Berhan Insurance")).toBe(true);
    expect(sameCompany("Bank of Oromia", "Oromia Bank")).toBe(true);
    expect(sameCompany("Integrated Service on Health and Development Organization /ISHDO/", "Integrated Service on Health and Development Organization")).toBe(true);
  });
  it("keeps different employers apart", () => {
    expect(sameCompany("Abay Bank", "Awash Bank")).toBe(false);
    expect(sameCompany("Dashen Bank", "Dashen Brewery")).toBe(false);
    expect(sameCompany("Standard Insurance", "Berhan Insurance")).toBe(false);
    expect(sameCompany(null, "Oromia Bank")).toBe(false);
  });
});
