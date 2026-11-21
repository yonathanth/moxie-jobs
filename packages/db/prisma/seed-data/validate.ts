import { FIELDS_OF_STUDY, FUNCTIONS } from "./taxonomy";

const SLUG = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/** Returns human-readable problems (duplicate or malformed ids); empty = valid. */
export function validateTaxonomy(): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();

  const check = (kind: string, id: string) => {
    if (!SLUG.test(id)) problems.push(`${kind} id "${id}" is not a snake_case slug`);
    const key = `${kind}:${id}`;
    if (seen.has(key)) problems.push(`duplicate ${kind} id "${id}"`);
    seen.set(key, id);
  };

  for (const fn of FUNCTIONS) {
    check("function", fn.id);
    if (fn.professions.length === 0) problems.push(`function "${fn.id}" has no professions`);
    for (const [id, name] of fn.professions) {
      check("profession", id);
      if (!name.trim()) problems.push(`profession "${id}" has no name`);
    }
  }
  for (const [id] of FIELDS_OF_STUDY) check("field", id);

  return problems;
}
