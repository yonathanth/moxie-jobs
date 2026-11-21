import { EDUCATION_LEVEL_IDS, EMPLOYER_TYPE_IDS, EMPLOYMENT_TYPE_IDS } from "@ethio/shared";
import { z } from "zod";

/**
 * What the model returns (docs/ingestion-spec.md §7.1). Deliberately tolerant:
 * a bad enum or number becomes null instead of failing the whole post.
 */

const str = z.string().trim().min(1).nullable().catch(null);
const int = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v),
    z.number().int().min(0).max(max).nullable().catch(null),
  );
const ids = z.array(z.string()).catch([]).default([]);

export const FLAG_IDS = ["unpaid", "fee_required", "overseas", "suspicious", "partial"] as const;

export const extractedJobSchema = z.object({
  title: str,
  raw_title: str,
  company: str,
  employer_type: z.enum(EMPLOYER_TYPE_IDS).nullable().catch(null),
  profession_id: str,
  function_id: str,
  field_of_study_ids: ids,
  education_level: z.enum(EDUCATION_LEVEL_IDS).nullable().catch(null),
  experience_min_years: int(60),
  experience_max_years: int(60),
  employment_type: z.enum(EMPLOYMENT_TYPE_IDS).nullable().catch(null),
  work_mode: z.enum(["onsite", "remote", "hybrid"]).nullable().catch(null),
  location_raw: str,
  city_ids: ids,
  country: str,
  positions: int(100_000),
  salary: z
    .object({
      min: int(100_000_000),
      max: int(100_000_000),
      currency: z.enum(["ETB", "USD", "EUR"]).nullable().catch(null),
      period: z.enum(["month", "year", "day", "hour", "project"]).nullable().catch(null),
      raw: str,
    })
    .nullable()
    .catch(null),
  gender: z.enum(["any", "female", "male"]).catch("any"),
  deadline: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
      calendar: z.enum(["gregorian", "ethiopian", "relative"]).nullable().catch(null),
      raw: str,
      ethiopian: z
        .object({ year: z.number().int(), month: z.number().int(), day: z.number().int() })
        .nullable()
        .catch(null),
    })
    .nullable()
    .catch(null),
  apply: z
    .object({
      method: z.enum(["url", "email", "telegram", "phone", "in_person", "source"]).catch("source"),
      url: str,
      email: str,
      telegram: str,
      phone: str,
      notes: str,
    })
    .catch({ method: "source", url: null, email: null, telegram: null, phone: null, notes: null }),
  summary: str,
  skills: z.array(z.string()).catch([]).default([]),
  flags: z.array(z.string()).catch([]).default([]),
});

export const extractionSchema = z.object({
  is_job_post: z.boolean().catch(false),
  reject_reason: z.enum(["not_job", "scam_suspected", "expired", "not_ethiopia"]).nullable().catch(null),
  jobs: z.array(extractedJobSchema).catch([]).default([]),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

/** Parses the model's text (tolerates ```json fences). Throws on non-JSON. */
export function parseExtraction(text: string): Extraction {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return extractionSchema.parse(JSON.parse(cleaned));
}
