/** Case/diacritic-insensitive search over a name and its aliases, best matches first. */

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface Searchable {
  id: string;
  name: string;
  aliases?: readonly string[];
}

/** 0 = no match; higher is better. */
export function score(item: Searchable, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(item.name);
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.split(" ").some((w) => w.startsWith(q))) return 60;
  const aliases = (item.aliases ?? []).map(normalize);
  if (aliases.some((a) => a === q || a.startsWith(q))) return 50;
  if (name.includes(q)) return 40;
  if (aliases.some((a) => a.includes(q))) return 30;
  return 0;
}

export function search<T extends Searchable>(items: readonly T[], query: string, limit = 20): T[] {
  return items
    .map((item) => ({ item, s: score(item, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((r) => r.item);
}
