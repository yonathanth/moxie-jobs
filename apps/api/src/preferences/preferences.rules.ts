import { CITY_IDS, type PlanLimits, type Preferences } from "@ethio/shared";
import type { TaxonomyIndex } from "../taxonomy/taxonomy.service";

export interface PreferenceIssue {
  path: string;
  message: string;
}

/**
 * Checks parsed preferences against the live taxonomy and the user's plan.
 * Pure, so it is unit-tested without a database.
 */
export function checkPreferences(p: Preferences, taxonomy: TaxonomyIndex, limits: PlanLimits): PreferenceIssue[] {
  const issues: PreferenceIssue[] = [];

  const unknown = (path: string, ids: string[], known: ReadonlySet<string>, what: string) => {
    const bad = ids.filter((id) => !known.has(id));
    if (bad.length) issues.push({ path, message: `Unknown ${what}: ${bad.join(", ")}` });
  };
  unknown("professionIds", p.professionIds, taxonomy.professionIds, "profession");
  unknown("functionIds", p.functionIds, taxonomy.functionIds, "job category");
  unknown("excludedProfessionIds", p.excludedProfessionIds, taxonomy.professionIds, "profession");
  unknown("fieldOfStudyIds", p.fieldOfStudyIds, taxonomy.fieldOfStudyIds, "field of study");
  unknown("locationIds", p.locationIds, CITY_IDS, "city");

  const cap = (path: string, count: number, max: number, what: string) => {
    if (count > max) issues.push({ path, message: `Your plan allows up to ${max} ${what}` });
  };
  cap("professionIds", p.professionIds.length, limits.maxProfessions, "professions");
  cap("functionIds", p.functionIds.length, limits.maxFunctions, "job categories");
  cap("fieldOfStudyIds", p.fieldOfStudyIds.length, limits.maxFieldsOfStudy, "fields of study");
  cap("locationIds", p.locationIds.length, limits.maxLocations, "cities");

  return issues;
}
