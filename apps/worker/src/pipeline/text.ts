import { createHash } from "node:crypto";

/** Lowercase, drop URLs/handles/emojis/punctuation, collapse whitespace. Keeps Ethiopic letters. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+|t\.me\/\S+|www\.\S+/g, " ")
    .replace(/@[a-z0-9_]{3,}/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function textHash(text: string): string {
  return createHash("sha256").update(normalizeText(text)).digest("hex");
}

const VACANCY_WORDS = [
  "vacancy",
  "vacancies",
  "hiring",
  "position",
  "job title",
  "deadline",
  "recruit",
  "applicants",
  "apply",
  "employment",
  "qualification",
  "experience",
  "ክፍት የስራ",
  "ክፍት የሥራ",
  "የስራ ማስታወቂያ",
  "የሥራ ማስታወቂያ",
  "ቅጥር",
  "አመልካቾች",
  "ማመልከቻ",
];

const NON_JOB_PATTERNS = [
  /scholarship/i,
  /\btraining\b/i,
  /\bwebinar\b/i,
  /\btender\b|\bbid\b|ጨረታ/i,
  /\bcrypto\b|\bairdrop\b|\btoken\b/i,
  /make money online|earn \d[\d,]* ?(birr|etb|br)\b/i,
  /join (our|the) channel|subscribe/i,
  /work visa|free (visa|ticket)/i,
];

export type SkipReason = "too_short" | "not_job";

/**
 * Cheap checks before any AI call. Returns a reason to skip, or null to continue.
 * Conservative: borderline posts go to the model, which can also reject.
 */
export function prefilter(text: string): SkipReason | null {
  const core = normalizeText(text);
  if (core.length < 40) return "too_short";
  const lower = text.toLowerCase();
  const hasVacancyWord = VACANCY_WORDS.some((w) => lower.includes(w));
  if (!hasVacancyWord && NON_JOB_PATTERNS.some((re) => re.test(text))) return "not_job";
  return null;
}

/** Token-set Jaccard similarity of two titles (for dedup). */
export function titleSimilarity(a: string, b: string): number {
  const stop = new Set(["and", "of", "the", "for", "re", "advert", "readvert", "senior", "junior", "i", "ii", "iii"]);
  const tokens = (s: string) => new Set(normalizeText(s).split(" ").filter((t) => t && !stop.has(t)));
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

const COMPANY_NOISE =
  /\b(plc|p\.l\.c|s\.c|sc|share company|private limited company|ltd|llc|inc|ngo|ethiopia|ethiopian branch|branch|office|company|co)\b\.?/gi;

const COMPANY_STOP = new Set(["of", "the", "and", "for", "on", "in", "at", "de"]);

/**
 * Spelling-tolerant token: Amharic names are transliterated inconsistently
 * (Birhan/Berhan, Oromiya/Oromia), so keep the first letter and the consonants.
 */
function skeleton(token: string): string {
  return (token[0]! + token.slice(1).replace(/[aeiouy]/g, "")).replace(/(.)\1+/g, "$1");
}

/**
 * Whether two employer names are the same organization despite spelling,
 * word order or an added acronym ("Bank of Oromia" = "Oromia Bank",
 * "Birhan Insurance SC" = "Berhan Insurance"). Used with title/deadline checks, never alone.
 */
export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const tokens = (name: string | null | undefined) => {
    const key = companyKey(name);
    if (!key) return new Set<string>();
    return new Set(key.split(" ").filter((t) => t && !COMPANY_STOP.has(t)).map(skeleton));
  };
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  // One name is the other plus an acronym or descriptor: "ISHDO" suffix, "Hospital" etc.
  const contained = inter === Math.min(ta.size, tb.size) && Math.min(ta.size, tb.size) >= 2;
  return jaccard >= 0.8 || contained;
}

/** Normalized company name used to group reposts of the same employer's job. */
export function companyKey(company: string | null | undefined): string | null {
  if (!company) return null;
  const key = normalizeText(company.replace(COMPANY_NOISE, " "));
  return key.length >= 2 ? key : null;
}
