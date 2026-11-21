import type { TaxonomyForPrompt } from "../ai/prompt";
import { prisma } from "../db";
import type { TaxonomyIds } from "./normalize";

const TTL_MS = 10 * 60_000;
let cache: { at: number; prompt: TaxonomyForPrompt; ids: TaxonomyIds } | null = null;

/** Active taxonomy for the prompt and for validating model output (cached 10 min). */
export async function loadTaxonomy(): Promise<{ prompt: TaxonomyForPrompt; ids: TaxonomyIds }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const [functions, professions, fields] = await Promise.all([
    prisma.jobFunction.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.profession.findMany({ where: { isActive: true }, orderBy: [{ functionId: "asc" }, { id: "asc" }] }),
    prisma.fieldOfStudy.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);
  cache = {
    at: Date.now(),
    prompt: {
      functions: functions.map((f) => ({ id: f.id, name: f.name })),
      professions: professions.map((p) => ({ id: p.id, name: p.name, functionId: p.functionId, aliases: p.aliases })),
      fields: fields.map((f) => ({ id: f.id, name: f.name, aliases: f.aliases })),
    },
    ids: {
      professionToFunction: new Map(professions.map((p) => [p.id, p.functionId])),
      functionIds: new Set(functions.map((f) => f.id)),
      fieldOfStudyIds: new Set(fields.map((f) => f.id)),
    },
  };
  return cache;
}
