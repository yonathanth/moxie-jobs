import { z } from "zod";
import { EDUCATION_LEVEL_IDS, EMPLOYMENT_TYPE_IDS, EXPERIENCE_BAND_IDS, GENDER_IDS } from "./enums";
import { MAX_LIMITS } from "./plans";

const id = z.string().trim().min(1).max(80);
const salary = z.number().int().min(0).max(10_000_000).nullable().default(null);
const uniqueIds = (max: number) =>
  z
    .array(id)
    .max(max)
    .transform((ids) => [...new Set(ids)]);

/**
 * What a user wants to be matched on. Shape checks only: the API also checks
 * ids against the taxonomy and caps list sizes by the user's plan.
 */
export const preferencesInputSchema = z
  .object({
    professionIds: uniqueIds(MAX_LIMITS.maxProfessions).default([]),
    functionIds: uniqueIds(MAX_LIMITS.maxFunctions).default([]),
    fieldOfStudyIds: uniqueIds(MAX_LIMITS.maxFieldsOfStudy).default([]),
    educationLevel: z.enum(EDUCATION_LEVEL_IDS).nullable().default(null),
    experienceBand: z.enum(EXPERIENCE_BAND_IDS).nullable().default(null),
    /** City ids. Empty = anywhere in Ethiopia. */
    locationIds: uniqueIds(MAX_LIMITS.maxLocations).default([]),
    remoteOk: z.boolean().default(true),
    /** Empty = any employment type. */
    employmentTypes: z
      .array(z.enum(EMPLOYMENT_TYPE_IDS))
      .max(EMPLOYMENT_TYPE_IDS.length)
      .default([])
      .transform((t) => [...new Set(t)]),
    /** Optional. null = don't filter gender-restricted jobs (they're labelled instead). */
    gender: z.enum(GENDER_IDS).nullable().default(null),
    /** Opt-in to jobs located abroad. */
    overseasOk: z.boolean().default(false),
    /** Optional expected monthly salary, ETB. Only jobs that state a lower pay than salaryMin are skipped. */
    salaryMin: salary,
    salaryMax: salary,
  })
  .refine((p) => p.salaryMin === null || p.salaryMax === null || p.salaryMin <= p.salaryMax, {
    message: "The lowest salary can't be higher than the highest",
    path: ["salaryMax"],
  })
  .refine((p) => p.professionIds.length + p.functionIds.length + p.fieldOfStudyIds.length > 0, {
    message: "Pick at least one profession, job category or field of study",
    path: ["professionIds"],
  });

export type PreferencesInput = z.input<typeof preferencesInputSchema>;
export type Preferences = z.output<typeof preferencesInputSchema>;
