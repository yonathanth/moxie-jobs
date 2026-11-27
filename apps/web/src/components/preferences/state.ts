import type { PlanLimits, Preferences, PreferencesDto } from "@ethio/shared";

export const EMPTY_PREFERENCES: Preferences = {
  professionIds: [],
  functionIds: [],
  excludedProfessionIds: [],
  fieldOfStudyIds: [],
  educationLevel: null,
  experienceBand: null,
  locationIds: [],
  remoteOk: true,
  employmentTypes: [],
  gender: null,
  overseasOk: false,
  salaryMin: null,
  salaryMax: null,
};

export function fromDto(dto: PreferencesDto | null | undefined): Preferences {
  if (!dto) return EMPTY_PREFERENCES;
  const { updatedAt: _updatedAt, ...prefs } = dto;
  return { ...prefs, excludedProfessionIds: prefs.excludedProfessionIds ?? [] };
}

export function hasTarget(p: Preferences): boolean {
  return p.professionIds.length + p.functionIds.length + p.fieldOfStudyIds.length > 0;
}

export function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function salaryInvalid(p: Preferences): boolean {
  return p.salaryMin !== null && p.salaryMax !== null && p.salaryMin > p.salaryMax;
}

export interface OverLimit {
  label: string;
  have: number;
  max: number;
}

/** Saved picks beyond the plan's limits (e.g. after a downgrade or when a paid plan ends). */
export function overLimits(p: Preferences, l: PlanLimits): OverLimit[] {
  const rows: OverLimit[] = [
    { label: l.maxProfessions === 1 ? "profession" : "professions", have: p.professionIds.length, max: l.maxProfessions },
    { label: l.maxFunctions === 1 ? "whole category" : "whole categories", have: p.functionIds.length, max: l.maxFunctions },
    { label: l.maxFieldsOfStudy === 1 ? "field of study" : "fields of study", have: p.fieldOfStudyIds.length, max: l.maxFieldsOfStudy },
    { label: l.maxLocations === 1 ? "city" : "cities", have: p.locationIds.length, max: l.maxLocations },
  ];
  return rows.filter((r) => r.have > r.max);
}

/** Keeps the first N of each list (the ones already used for matching). */
export function trimToLimits(p: Preferences, l: PlanLimits): Preferences {
  return {
    ...p,
    professionIds: p.professionIds.slice(0, l.maxProfessions),
    functionIds: p.functionIds.slice(0, l.maxFunctions),
    fieldOfStudyIds: p.fieldOfStudyIds.slice(0, l.maxFieldsOfStudy),
    locationIds: p.locationIds.slice(0, l.maxLocations),
  };
}
