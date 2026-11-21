import { describe, expect, it } from "vitest";
import { ethiopianMonthFromName, ethiopianToGregorian } from "../src/lib/ethiopian-calendar";

const iso = (d: Date | null) => d?.toISOString().slice(0, 10);

describe("ethiopianToGregorian", () => {
  it("converts known new-year dates", () => {
    expect(iso(ethiopianToGregorian(2017, 1, 1))).toBe("2024-09-11");
    expect(iso(ethiopianToGregorian(2016, 1, 1))).toBe("2023-09-12"); // after leap year 2015 EC
    expect(iso(ethiopianToGregorian(2019, 1, 1))).toBe("2026-09-11");
  });

  it("converts dates inside the year", () => {
    expect(iso(ethiopianToGregorian(2019, 3, 15))).toBe("2026-11-24"); // Hidar 15, 2019
    expect(iso(ethiopianToGregorian(2017, 5, 11))).toBe("2025-01-19"); // Timket (Tir 11)
    expect(iso(ethiopianToGregorian(2016, 4, 29))).toBe("2024-01-08"); // year after a leap year: Meskerem 1 fell on Sep 12
  });

  it("handles Pagume and rejects impossible dates", () => {
    expect(iso(ethiopianToGregorian(2015, 13, 6))).toBe("2023-09-11"); // 2015 EC is a leap year
    expect(ethiopianToGregorian(2016, 13, 6)).toBeNull();
    expect(ethiopianToGregorian(2019, 2, 31)).toBeNull();
    expect(ethiopianToGregorian(2019, 14, 1)).toBeNull();
  });
});

describe("ethiopianMonthFromName", () => {
  it("knows Amharic and transliterated names", () => {
    expect(ethiopianMonthFromName("ኅዳር")).toBe(3);
    expect(ethiopianMonthFromName("ህዳር")).toBe(3);
    expect(ethiopianMonthFromName("Tahsas")).toBe(4);
    expect(ethiopianMonthFromName("ጳጉሜን")).toBe(13);
    expect(ethiopianMonthFromName("November")).toBeNull();
  });
});
