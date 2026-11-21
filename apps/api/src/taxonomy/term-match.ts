/**
 * Free, local matching of a typed "not listed" term against taxonomy entries
 * (names + aliases). Pure, unit-tested. Only when nothing is close enough does
 * the resolver ask the AI, and then only about the top candidates from here.
 */

export interface TermItem {
  id: string;
  name: string;
  aliases: string[];
}

/** Lowercase, no accents/punctuation, single spaces. Keeps Ethiopic letters. */
export function normalizeTerm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Words that say nothing about the subject ("BSc in ...", "degree of ..."). */
const FILLER = new Set(["bsc", "ba", "ma", "msc", "mba", "phd", "bed", "llb", "degree", "diploma", "in", "of", "and", "the", "level", "certificate", "studies"]);

function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Levenshtein distance (short strings only; terms are ≤ 80 chars). */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** 0..1 similarity of two normalized strings: the best of typo distance, word overlap and character trigram overlap. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Typos ("acounting"): one or two edits on a word-length string.
  const typo = Math.max(a.length, b.length) >= 5 ? 1 - editDistance(a, b) / Math.max(a.length, b.length) : 0;
  const words = (s: string) => new Set(s.split(" ").filter((w) => w && !FILLER.has(w)));
  const wa = words(a);
  const wb = words(b);
  const word = wa.size && wb.size ? jaccard(wa, wb) : 0;
  const tri = jaccard(trigrams(a), trigrams(b));
  // A typed term fully contained in a name ("hotel mgmt" vs "tourism hotel management") is a strong hint.
  const contained = wa.size > 0 && [...wa].every((w) => [...wb].some((x) => x.startsWith(w) || w.startsWith(x))) ? 0.85 : 0;
  return Math.max(typo, word, tri, contained);
}

export interface Scored {
  id: string;
  name: string;
  score: number;
}

/** Items ranked by their best name/alias similarity to the term. */
export function rankCandidates(term: string, items: readonly TermItem[], limit = 25): Scored[] {
  const t = normalizeTerm(term);
  return items
    .map((it) => ({
      id: it.id,
      name: it.name,
      score: Math.max(similarity(t, normalizeTerm(it.name)), ...it.aliases.map((a) => similarity(t, normalizeTerm(a)))),
    }))
    .filter((s) => s.score > 0.1)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Close enough to accept without asking the AI. */
export const LOCAL_ACCEPT = 0.82;
/** Used as a fallback match when the AI is unavailable. */
export const LOCAL_FALLBACK = 0.5;
