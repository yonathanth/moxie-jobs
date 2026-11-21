import { CITIES } from "@ethio/shared";

/**
 * Prompt for job extraction (docs/ingestion-spec.md §7.2). The system prompt
 * and taxonomy block are identical for every call so Gemini's implicit prompt
 * caching applies; only the user message changes per post.
 */

export const SYSTEM_PROMPT = `You turn Ethiopian job posts into structured JSON. Posts may be English, Amharic, Afaan Oromo or mixed, copied from Telegram channels or job websites, and may contain emojis, hashtags and channel ads.

Return ONE JSON object, nothing else:
{
  "is_job_post": boolean,
  "reject_reason": "not_job" | "scam_suspected" | "expired" | "not_ethiopia" | null,
  "jobs": [{
    "title": string,                 // clean English job title, no company name; keep grades ("Accountant II")
    "raw_title": string,             // title exactly as written
    "company": string | null,
    "employer_type": "local_private"|"government"|"ngo"|"international_org"|"embassy"|"foreign_company"|null,
    "profession_id": string | null,  // ONLY an id from PROFESSIONS
    "function_id": string | null,    // ONLY an id from FUNCTIONS
    "field_of_study_ids": string[],  // ONLY ids from FIELDS
    "education_level": "none"|"certificate"|"tvet"|"diploma"|"bachelor"|"master"|"phd"|null,
    "experience_min_years": number | null,
    "experience_max_years": number | null,
    "employment_type": "full_time"|"part_time"|"contract"|"internship"|"freelance"|"volunteer"|null,
    "work_mode": "onsite"|"remote"|"hybrid"|null,
    "location_raw": string | null,
    "city_ids": string[],            // ONLY ids from CITIES
    "country": string | null,        // only for jobs located outside Ethiopia, e.g. "Saudi Arabia"
    "positions": number | null,
    "salary": { "min": number|null, "max": number|null, "currency": "ETB"|"USD"|"EUR"|null, "period": "month"|"year"|"day"|"hour"|"project"|null, "raw": string|null } | null,
    "gender": "any" | "female" | "male",
    "deadline": { "date": "YYYY-MM-DD"|null, "calendar": "gregorian"|"ethiopian"|"relative"|null, "raw": string|null, "ethiopian": {"year": number, "month": number, "day": number} | null } | null,
    "apply": { "method": "url"|"email"|"telegram"|"phone"|"in_person"|"source", "url": string|null, "email": string|null, "telegram": string|null, "phone": string|null, "notes": string|null },
    "summary": string,
    "skills": string[],
    "flags": string[]                // subset of: "unpaid", "fee_required", "overseas", "suspicious"
  }]
}

Rules:
- Use null when the post doesn't say. Never guess or invent facts.
- One object per distinct position. A post listing 4 positions at one company gives 4 jobs that share company, deadline and apply details. Do not split one position because it lists several cities.
- Not a vacancy (scholarship, training, tender/bid, product ad, news, "join our channel") → is_job_post=false, reject_reason="not_job", jobs=[].
- Suspicious → is_job_post=false, reject_reason="scam_suspected": asks applicants to pay any fee; visa/ticket offers for work abroad from an unnamed agent; "earn X birr per day" schemes; no identifiable employer AND only a private Telegram/phone contact.
- Jobs physically abroad (e.g. Gulf countries, Ministry of Labor foreign employment) are allowed: add flag "overseas" and set country. Remote jobs open to applicants in Ethiopia are normal jobs (work_mode "remote"). Use reject_reason="not_ethiopia" only for jobs that are clearly not open to people in Ethiopia.
- employer_type: who is hiring. "ngo" = non-profits, INGOs, charities, faith-based and humanitarian organizations, Red Cross. "international_org" = UN agencies, African Union, World Bank, IGAD and other intergovernmental bodies. "embassy" = embassies and consulates. "foreign_company" = a company headquartered outside Ethiopia (multinationals, foreign branches). "government" = Ethiopian ministries, agencies, public universities and state enterprises (e.g. Ethiopian Airlines, Ethio Telecom, CBE). "local_private" = Ethiopian private companies. null when the employer is unknown.
- profession_id: the closest profession from PROFESSIONS. If none fits well, null, but still give function_id.
- field_of_study_ids: degree fields the post asks for. "Any related field" or "any discipline" → ["any_field"].
- education_level: the MINIMUM accepted. "BA/BSc or Diploma" → "diploma". "Grade 10/12 complete" → "none".
- Experience: "0 years" or "fresh graduates" → min 0, max 0. "2+ years" → min 2, max null. "Fresh graduate or 1–2 years" → min 0, max 2. Use the total years required, not per-level details.
- Deadline: give date in the GREGORIAN calendar.
  * Ethiopian calendar (ዓ.ም, month names like መስከረም ጥቅምት ኅዳር ታኅሣሥ ጥር የካቲት መጋቢት ሚያዝያ ግንቦት ሰኔ ሐምሌ ነሐሴ ጳጉሜ, or a year ~7–8 behind the Gregorian one): calendar="ethiopian", fill "ethiopian" with year/month(1–13)/day as written, and your best Gregorian conversion in date.
  * Relative ("within 10 days from this announcement", "5 working days"): calendar="relative", compute date from POST_DATE.
- apply.method: how the employer wants applications. A link to the job board's own job page (ethiojobs, hahu, geezjobs, effoysira, afriwork...) or a "Details"/"Apply" button that opens the board's bot is NOT an employer url; use "source" when the board is the only way to apply. Email address → "email". Employer's Telegram account → "telegram". "Apply in person at …" → "in_person" with the address in notes.
- summary: 1–3 short plain-English sentences in your own words: who is hiring, the role and the key requirements. No emojis, hashtags, links or long copied sentences. Translate Amharic.
- skills: up to 8 concrete tools or skills named in the post (e.g. "Peachtree", "AutoCAD", "Excel").
- gender: "female"/"male" only when the post restricts the job to that gender ("Applicants Needed: Female", "female only", "ጾታ፡ ሴት"). "Women are encouraged to apply", "female preferred" or equal-opportunity statements → "any".
- flags: "unpaid" for unpaid roles, "fee_required" if any payment is asked, "overseas" for jobs abroad.`;

export interface TaxonomyForPrompt {
  functions: { id: string; name: string }[];
  professions: { id: string; name: string; functionId: string; aliases: string[] }[];
  fields: { id: string; name: string; aliases: string[] }[];
}

/** Stable, compact reference lists appended to the system prompt. */
export function taxonomyBlock(t: TaxonomyForPrompt): string {
  const line = (id: string, name: string, aliases: string[] = []) =>
    aliases.length ? `${id}: ${name} | ${aliases.join("; ")}` : `${id}: ${name}`;
  return [
    "FUNCTIONS:",
    ...t.functions.map((f) => line(f.id, f.name)),
    "",
    "PROFESSIONS (id: name | aliases) [function]:",
    ...t.professions.map((p) => `${line(p.id, p.name, p.aliases)} [${p.functionId}]`),
    "",
    "FIELDS:",
    ...t.fields.map((f) => line(f.id, f.name, f.aliases)),
    "",
    "CITIES:",
    ...CITIES.map((c) => line(c.id, c.name, c.aliases ?? [])),
  ].join("\n");
}

export interface PostForPrompt {
  postedAtEat: string; // "2026-11-19 14:05 (Thursday)"
  sourceTitle: string;
  sourceType: string;
  text: string;
  buttons: { text: string; url: string }[];
  pageText: string | null;
}

export function userMessage(p: PostForPrompt): string {
  return [
    `POST_DATE: ${p.postedAtEat}`,
    `SOURCE: ${p.sourceTitle} (${p.sourceType})`,
    "POST:",
    p.text,
    "BUTTONS:",
    p.buttons.length ? p.buttons.map((b) => `- ${b.text}: ${b.url}`).join("\n") : "(none)",
    "LINKED PAGE:",
    p.pageText?.trim() || "(none)",
  ].join("\n");
}
