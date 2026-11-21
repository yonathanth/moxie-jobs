/**
 * Ethiopian (Ge'ez) calendar → Gregorian, via Julian Day Numbers.
 * 12 months of 30 days + Pagume (5 days, 6 in a leap year: EC year % 4 === 3).
 * Meskerem 1, 2017 EC = 11 Sep 2024; Meskerem 1, 2019 EC = 11 Sep 2026.
 */

const ETHIOPIC_EPOCH_JDN = 1724221; // JDN of Meskerem 1, year 1 (Amete Mihret)

export const ETHIOPIAN_MONTHS: { month: number; names: string[] }[] = [
  { month: 1, names: ["መስከረም", "meskerem", "meskarem", "maskaram"] },
  { month: 2, names: ["ጥቅምት", "tikimt", "tikemt", "tiqimt", "tekemt"] },
  { month: 3, names: ["ኅዳር", "ህዳር", "ሕዳር", "hidar", "hedar"] },
  { month: 4, names: ["ታኅሣሥ", "ታህሳስ", "ታኅሳስ", "ታሕሳስ", "tahsas", "tahesas", "tahisas"] },
  { month: 5, names: ["ጥር", "tir", "ter", "tirr"] },
  { month: 6, names: ["የካቲት", "yekatit", "yakatit"] },
  { month: 7, names: ["መጋቢት", "megabit", "magabit"] },
  { month: 8, names: ["ሚያዝያ", "ሚያዚያ", "miyazya", "miazia", "miyazia"] },
  { month: 9, names: ["ግንቦት", "ginbot", "genbot"] },
  { month: 10, names: ["ሰኔ", "sene", "sené"] },
  { month: 11, names: ["ሐምሌ", "ሀምሌ", "ሓምሌ", "hamle", "hamlie"] },
  { month: 12, names: ["ነሐሴ", "ነሀሴ", "nehase", "nehasse"] },
  { month: 13, names: ["ጳጉሜ", "ጳጉሜን", "pagume", "pagumen", "puagme"] },
];

export function ethiopianMonthFromName(name: string): number | null {
  const n = name.trim().toLowerCase();
  for (const m of ETHIOPIAN_MONTHS) if (m.names.some((x) => x.toLowerCase() === n)) return m.month;
  return null;
}

export function isValidEthiopianDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || month < 1 || month > 13 || day < 1) return false;
  if (month <= 12) return day <= 30;
  return day <= (year % 4 === 3 ? 6 : 5);
}

/** Returns the Gregorian date as UTC midnight, or null for an invalid Ethiopian date. */
export function ethiopianToGregorian(year: number, month: number, day: number): Date | null {
  if (!isValidEthiopianDate(year, month, day)) return null;
  const jdn = ETHIOPIC_EPOCH_JDN + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + day - 1;
  return jdnToGregorian(jdn);
}

/** Fliegel–Van Flandern inverse algorithm. */
function jdnToGregorian(jdn: number): Date {
  let l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  return new Date(Date.UTC(year, month - 1, day));
}
