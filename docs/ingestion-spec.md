# Ingestion, extraction, matching & delivery: spec (v1)

Status: approved 2026-11-19 (decisions in §16) · Milestones 3–4 of v1 · Sources: `packages/db/prisma/seed-data/sources.ts`

## 1. Goal

A job posted in a tracked Telegram channel reaches a matching **Pro** user's chat in **under ~15 s**. Free users get it in their next batch (every 2 h). Every job is stored once, even when 5 channels repost it. It is summarised in English, mapped to our taxonomy, and has the best available apply link.

Non-goals for v1: website scrapers (sites reach us through their own channels), embeddings, Amharic UI, CV features.

## 2. Pipeline

```
 Telegram channels
        │  (GramJS user-account listener, worker process)
        ▼
 ① RawPost (stored verbatim, idempotent on source+messageId)
        │  pre-filter: empty / non-job keywords / exact text or link already seen
        ▼
 ② Enrich: format B → fetch linked page text (allowlisted domains)
        ▼
 ③ Extract: Gemini 3.5 Flash-Lite, JSON schema → 0..N job candidates per post
        ▼
 ④ Normalize: taxonomy ids, cities, Ethiopian-calendar deadlines, apply link
        ▼
 ⑤ Dedup/merge → Job (+ JobSighting per source post)
        ▼
 ⑥ Match → Delivery rows (instant for Pro, batched for Free)
        ▼
 ⑦ Send via bot (rate-limited queue) → click tracking
```

Processing state lives in Postgres, not Redis: `RawPost.status` (new → processing → done/skipped/failed) is the queue, claimed with `FOR UPDATE SKIP LOCKED`, retried up to 3 times, with stale locks released after 10 min. At ~1k posts/day this needs no extra infrastructure. The listener nudges the pipeline after each stored post, and a 5 s poll is the backup. Everything runs in one worker process (`apps/worker`, plain TypeScript): listener, pipeline, expiry, and later delivery. Delivery sends with the bot token via `api.sendMessage` only, so it never conflicts with the API webhook.

## 3. Data model (new Prisma models)

```prisma
model Source {
  id            String   @id            // seed key, e.g. "hahujobs"
  title         String
  kind          String   @default("telegram")  // telegram | website (later)
  handle        String?  @unique        // channel @username, null until confirmed
  tgChannelId   BigInt?  @unique        // resolved numeric id (stable even if handle changes)
  type          String                  // original | repost | niche | regional | newspaper | employer
  format        String                  // full | website_link | miniapp_link | mixed
  websiteDomains String[] @default([])
  tier          Int      @default(1)
  trust         Float    @default(0.7)
  linkPriority  Int      @default(50)
  isActive      Boolean  @default(false) // joined + listening
  lastMessageId BigInt?                  // catch-up cursor
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  posts RawPost[]
}

model RawPost {
  id          String   @id @default(uuid())
  sourceId    String
  messageId   BigInt
  postedAt    DateTime
  editedAt    DateTime?
  text        String                     // message text or media caption
  buttons     Json     @default("[]")    // [{text, url}] from inline keyboard
  links       String[] @default([])      // URLs in text entities
  textHash    String                     // sha256 of normalized text (pre-filter)
  status      String   @default("new")   // new | skipped | enriched | extracted | failed
  skipReason  String?
  pageText    String?                    // enrichment result (format B)
  pageUrl     String?
  error       String?
  createdAt   DateTime @default(now())
  source   Source       @relation(fields: [sourceId], references: [id])
  sightings JobSighting[]
  @@unique([sourceId, messageId])
  @@index([textHash])
  @@index([status, createdAt])
}

model Job {
  id              String   @id @default(uuid())
  slug            String   @unique         // for public SEO pages: "accountant-kerchanshe-trading-<short>"
  title           String
  rawTitle        String
  company         String?
  companyKey      String?                  // normalized company, for dedup
  professionId    String?                  // null = unmapped → admin queue
  functionId      String?
  fieldOfStudyIds String[] @default([])
  educationLevel  String?                  // minimum required
  experienceMin   Int?
  experienceMax   Int?
  employmentType  String?
  workMode        String?                  // onsite | remote | hybrid
  locationIds     String[] @default([])    // city ids; empty + workMode remote = anywhere
  locationRaw     String?
  positions       Int?
  salaryMin       Int?
  salaryMax       Int?
  salaryCurrency  String?                  // ETB | USD
  salaryPeriod    String?                  // month | year | hour | project
  salaryRaw       String?
  genderReq       String   @default("any") // any | female | male
  deadline        DateTime?                // end of day, Africa/Addis_Ababa
  summary         String                   // ≤ 3 sentences, English, our own words
  skills          String[] @default([])
  applyMethod     String                   // url | email | telegram | phone | in_person | source
  applyUrl        String?
  applyEmail      String?
  applyTelegram   String?
  applyPhone      String?
  applyNotes      String?
  primarySourceId String                   // source whose link we show (highest linkPriority)
  sourceUrl       String                   // that source's job page / mini app link / t.me post
  qualityFlags    String[] @default([])    // e.g. unpaid, fee_required, suspicious, overseas
  status          String   @default("active") // active | expired | hidden | review
  firstSeenAt     DateTime @default(now())
  updatedAt       DateTime @updatedAt
  sightings  JobSighting[]
  deliveries Delivery[]
  @@index([status, firstSeenAt])
  @@index([professionId, status])
  @@index([functionId, status])
  @@index([companyKey, deadline])
}

/// One per (job, source post): proves which channels carried it and who was first.
model JobSighting {
  jobId     String
  rawPostId String
  seenAt    DateTime @default(now())
  isFirst   Boolean  @default(false)
  job     Job     @relation(fields: [jobId], references: [id], onDelete: Cascade)
  rawPost RawPost @relation(fields: [rawPostId], references: [id], onDelete: Cascade)
  @@id([jobId, rawPostId])
}

model Delivery {
  id         String   @id @default(uuid())
  userId     String
  jobId      String
  mode       String                    // instant | batch | urgent
  status     String   @default("pending") // pending | sent | skipped | failed
  scheduledFor DateTime                // instant = now; batch = next slot
  sentAt     DateTime?
  tgMessageId BigInt?
  clickedAt  DateTime?                 // first Apply click
  error      String?
  createdAt  DateTime @default(now())
  @@unique([userId, jobId])            // never send the same job twice
  @@index([status, scheduledFor])
}

model ExtractionLog {                  // cost + quality tracking
  id          String   @id @default(uuid())
  rawPostId   String
  model       String
  inputTokens Int
  outputTokens Int
  cachedTokens Int @default(0)
  latencyMs   Int
  jobsFound   Int
  ok          Boolean
  error       String?
  createdAt   DateTime @default(now())
}
```

Also add `UserPreferences.lastBatchAt DateTime?` for the free-tier batch schedule.

## 4. Listener (GramJS)

- **Account:** a dedicated Telegram user account (not personal), logged in once interactively. The string session goes in `TG_SESSION`.
- **Joining:** at most ~5 channels/day at first, spaced minutes apart. For `handle: null` sources, run `contacts.search(title)`, show candidates in admin, and join only after an admin confirms. Store `tgChannelId`.
- **Live updates:** handle `NewMessage` and `EditedMessage` for joined channels. Ignore service messages. For albums (`groupedId`), merge the captions into one post.
- **Catch-up:** on start, call `messages.getHistory` per active source from `lastMessageId`, oldest first, max 100 per source. Advance `lastMessageId` after each stored post.
- **Captured fields:** text/caption plus entities. URLs come from text entities, and buttons from `replyMarkup.rows[].buttons[]` (`KeyboardButtonUrl`, `KeyboardButtonWebView`, `KeyboardButtonUrlAuth` → `{text, url}`).
- **Edits:** if the post was already extracted and the text changed meaningfully (hash differs), re-extract and update the job. Never re-notify.
- **Safety:** read only. Never post, react or forward from this account. Handle `FLOOD_WAIT` by sleeping the requested time.

## 5. Pre-filter (free, before any AI call)

Skip a post (`status=skipped`, with `skipReason`) when:
1. text is under 40 characters (after stripping links/emojis)
2. `textHash` was already seen in the last 30 days → `duplicate_text`. It still gets a sighting once the matching job is found by link.
3. every job link in it is already attached to an existing Job → `duplicate_link`
4. it matches the non-job patterns (scholarship, training, "join our channel", tender/bid without a vacancy, crypto, "make money online", work visa abroad) and has **no** vacancy keyword (vacancy, position, hiring, deadline, ክፍት የስራ ቦታ, የስራ ማስታወቂያ, ቅጥር). Borderline cases go to the AI.

Target: ≥ 40% of posts never reach the LLM.

## 6. Enrichment (format `website_link`, and `mixed` posts that have a link)

- Fetch only URLs whose host is in the source's `websiteDomains` (an allowlist, so no arbitrary URLs), plus redirects within those hosts.
- Use plain HTTP GET with an 8 s timeout, a 2 MB cap and a polite User-Agent naming our service. Limit to 1 request/second per domain and honour robots.txt (cached daily).
- Extract the main text: strip nav/footer/script, prefer `<article>`/`<main>`, and collapse whitespace. Keep at most 6,000 characters in `pageText`.
- Treat failure as non-fatal: extract from the post alone and set `qualityFlags += partial`.
- Format `miniapp_link`: no fetch. The button URL (`t.me/...startapp=...`) becomes `sourceUrl`.

## 7. Extraction (Gemini)

- **Model:** `gemini-3.5-flash-lite` via the OpenAI-compatible endpoint (same client as GoMoxie). Settings: `reasoning_effort: none`, `temperature: 0`, `response_format: json_schema` (strict).
- **Input:** system prompt (fixed, cached) + the taxonomy list (cached) + a per-post message containing the source title/type, the post date (EAT), post text, button labels+URLs, and the page text.
- **One post can produce several jobs** (Effoy and Elelana list several positions per company). Return one object per distinct position.
- **Validation:** parse with Zod. Unknown taxonomy ids → `null` + `rawTitle` kept → admin review queue. Model or validation errors retry twice, then go to the DLQ.

### 7.1 Output schema

```jsonc
{
  "is_job_post": true,
  "reject_reason": null,            // "not_job" | "scam_suspected" | "expired" | "not_ethiopia" | null
  "jobs": [{
    "title": "Junior Accountant",   // clean English title, no company
    "raw_title": "Jr. Accountant II (Re-advertised)",
    "company": "Kerchanshe Trading PLC",   // null if not stated
    "profession_id": "junior_accountant",  // from list, or null
    "function_id": "accounting_finance",   // from list, or null
    "field_of_study_ids": ["accounting", "finance"],
    "education_level": "bachelor",          // none|certificate|tvet|diploma|bachelor|master|phd|null
    "experience_min_years": 0, "experience_max_years": 2,
    "employment_type": "full_time",         // full_time|part_time|contract|internship|freelance|volunteer|null
    "work_mode": "onsite",                  // onsite|remote|hybrid
    "location_raw": "Jimma & Adami Tulu",
    "city_ids": ["jimma", "batu"],
    "positions": 2,
    "salary": { "min": 15000, "max": null, "currency": "ETB", "period": "month", "raw": "15,000 ETB" },  // or null
    "gender": "any",                        // any|female|male
    "deadline": { "date": "2026-11-22", "calendar": "gregorian", "raw": "Nov 22, 2026" },  // date null if unknown
    "apply": {
      "method": "url",                      // url|email|telegram|phone|in_person|source
      "url": "https://…", "email": null, "telegram": null, "phone": null,
      "notes": "Bring original documents to HR office, Jimma"   // short, only if useful
    },
    "summary": "Kerchanshe is hiring two junior accountants in Jimma and Adami Tulu. BA in Accounting or Finance with 0–2 years' experience.",
    "skills": ["Peachtree", "IFRS", "Excel"],
    "flags": []                             // unpaid|fee_required|overseas|suspicious|partial
  }]
}
```

### 7.2 Prompt (draft v1)

```
You turn Ethiopian job posts into structured data. Posts may be English, Amharic, Afaan Oromo, or mixed,
copied from Telegram channels or job websites, and may contain emojis, hashtags and channel ads.

Rules:
- Output JSON matching the schema only. Use null when the post doesn't say; never guess or invent.
- One object per distinct position. A post listing 4 positions at one company → 4 jobs sharing company,
  deadline and apply details. Do not split one position because it lists several cities.
- Not a vacancy (scholarship, training, tender, ad, news, "join our channel") → is_job_post=false,
  reject_reason="not_job", jobs=[].
- Suspicious (asks applicants to pay a fee, "work abroad" visa offers, "earn X birr per day" schemes,
  no identifiable employer AND only a private Telegram/phone contact) → reject_reason="scam_suspected".
- Job located outside Ethiopia and not remote-open to Ethiopians → reject_reason="not_ethiopia".
- title: clean English job title without company, grade numbers stay ("Accountant II").
- profession_id / function_id / field_of_study_ids: choose ONLY ids from the lists provided.
  Pick the closest profession; if none fits well, profession_id=null but still pick function_id.
  "Any related field" → field_of_study_ids=["any_field"].
- education_level: the MINIMUM required. "BA/BSc or Diploma" → "diploma".
- experience: "0 years"/"fresh graduates" → min 0 max 0. "2+ years" → min 2 max null.
  "Fresh graduate or 1–2 years" → min 0 max 2.
- city_ids: from the city list only; put the original wording in location_raw.
- deadline: return ISO date in the GREGORIAN calendar. If the post uses the Ethiopian calendar
  (ዓ.ም, months like መስከረም, ጥቅምት, ኅዳር, ታኅሣሥ…, or years like 2019 that are ~7–8 years behind),
  set calendar="ethiopian" and put the Ethiopian date as raw AND your best Gregorian conversion in date
  (we re-verify it). Relative deadlines ("within 10 days of this announcement", "5 working days") →
  calendar="relative", compute from POST_DATE, date = result.
- apply.method: how the employer wants applications. A link to the source's own job page is NOT
  an apply url; use "source" when the only way is via the source's site/bot.
- summary: 1–3 short sentences in plain English, in your own words: who is hiring, the role, key
  requirement(s). No emojis, no hashtags, no copying long sentences.
- skills: up to 8 concrete tools/skills named in the post.
- flags: "unpaid" for unpaid roles, "fee_required" if any payment is asked, "overseas" for jobs abroad.

POST_DATE: {{posted_at_eat}}
SOURCE: {{source_title}} ({{source_type}})
POST:
{{text}}
BUTTONS:
{{buttons}}
LINKED PAGE (may be empty):
{{page_text}}
```

The function, profession, field and city lists are appended once as compact `id: name | aliases` lines (~5k tokens) and **cached** with Gemini context caching.

### 7.3 Golden test set

Before launch, collect 60 real posts covering every Tier 1 source, plus Amharic, Ethiopian-calendar, multi-position and scam examples. Store the expected output in `apps/worker/test/fixtures`. A CI-optional eval script reports per-field accuracy. Ship the model/prompt once profession accuracy is ≥ 85% and deadline accuracy is ≥ 90%.

## 8. Normalization

- **Deadlines:** for `calendar=ethiopian`, convert the `raw` Ethiopian date ourselves with a deterministic converter and overwrite the model's guess. Store as 23:59:59 Africa/Addis_Ababa. A deadline already past at ingest → `status=expired` (stored for dedup, not delivered).
- **No deadline:** treat as expired 30 days after `firstSeenAt`.
- **Company key:** lowercase; strip `plc|s.c.|share company|p.l.c|ltd|llc|ngo|ethiopia|branch`; collapse spaces.
- **Apply link priority:**
  1. the employer's own URL (not a job-board domain)
  2. email, shown via our job page with a copy button (Telegram buttons can't open `mailto:`)
  3. the employer's Telegram handle
  4. the source Mini App deep link (format C)
  5. the source website job page
  6. the Telegram post link `https://t.me/<handle>/<messageId>`
- **Slug:** `${title}-${company}-${6-char id}`, kebab-case ASCII.

## 9. Dedup and merge

1. **Fingerprint candidates:** active or expired Jobs from the last 45 days where `companyKey` matches and (the title's normalized tokens Jaccard ≥ 0.6, or `professionId` is equal) and the deadlines match within ±2 days (or either is null).
2. **No company** (common in reposts): compare the normalized summary and requirements text with trigram similarity ≥ 0.8 (Postgres `pg_trgm`) within 7 days, same `professionId`.
3. **Match found:** add a `JobSighting`. If the new source's `linkPriority` is higher, switch `primarySourceId`/`sourceUrl` (and `applyUrl` if the new one is better per §8). Fill null fields from the new extraction and never overwrite non-null ones. **Never re-deliver.**
4. **No match:** create the Job, with `isFirst=true` on its sighting.

Later (not v1): embedding similarity via pgvector, to catch reworded copies.

**Source value metric** (admin): over 14 days, for each source count the jobs it saw first and the jobs only it carried. A Tier 2 source stays only if it brings unique jobs.

## 10. Matching (v1, SQL + code)

A user U matches job J when all of these hold:

| Rule | Logic |
|---|---|
| Target | `J.professionId ∈ U.professionIds` **or** `J.functionId ∈ U.functionIds` **or** (`J.fieldOfStudyIds ∩ U.fieldOfStudyIds ≠ ∅` and J's function relates to one of U's professions/functions, or U picked no professions at all) |
| Education | `U.educationLevel` null **or** `J.educationLevel` null **or** rank(U) ≥ rank(J) |
| Experience | `U.experienceBand` null **or** J has no range **or** the ranges overlap (U band 1–2 vs J 0–2 ✓; U 0 vs J 3+ ✗) |
| Location | `U.locationIds` empty **or** `J.locationIds ∩ U.locationIds ≠ ∅` **or** (`J.workMode = remote` and `U.remoteOk`) **or** `J.locationIds` empty (unknown) |
| Employment | `U.employmentTypes` empty **or** `J.employmentType` null **or** `J.employmentType ∈ U.employmentTypes` |
| Gender | `J.genderReq = any` **or** `U.gender` null (job sent with a "female applicants only" label) **or** `U.gender = J.genderReq` |
| Overseas | `J.isOverseas = false` **or** `U.overseasOk` (opt-in toggle) |
| State | user onboarded, not `alertsPaused`, not `botBlockedAt`; job `status=active`, deadline in the future, `qualityFlags` has no `suspicious` |
| Plan caps | only the first N professions/functions (in saved order) count, N = the user's current plan limit |

Field-of-study rule rationale: "BA in Management" alone would match far too much. Field-only matching is for users who chose "match me by degree".

Implementation: candidate users come from one indexed query (`UserProfession`/`UserFunction` joins + preference arrays with `&&`); the remaining rules run in code. Matching is triggered once per new Job.

## 11. Delivery

- **Pro (or beta):** `mode=instant`, `scheduledFor=now`.
- **Free:** `mode=batch`, `scheduledFor` = the next 2-hour slot (07:00, 09:00, … 21:00 EAT). Quiet hours are 22:00–07:00; anything matched at night goes in the 07:00 batch.
- **Urgent:** a deadline within 24 h → `mode=urgent`, sent immediately even to free users.
- **Free daily cap:** 15 jobs/day (admin setting). The extra matches show only in the Mini App feed.
- **Batch format:** up to 3 full cards, then one message: "➕ 5 more matches → [Open my jobs]".
- **Rate limits:** a global token bucket of 25 msg/s (Telegram allows ~30) and at most 1 msg/s per chat. Uses grammY auto-retry. A 403 marks the user `botBlockedAt` and skips their pending deliveries.
- **Card (HTML):**

```
💼 <b>Junior Accountant</b>
🏢 Kerchanshe Trading PLC
📍 Jimma, Batu · 0–2 yrs · BA Accounting
⏳ Deadline: Nov 22 (5 days left)

Kerchanshe is hiring two junior accountants…

<i>Source: Ethiojobs</i>
[ 📨 Apply ]  [ 🔎 Details ]
```

  On free batched cards, add: "⚡ Pro members got this 1h 40m ago". The **Apply** button points to `https://job.gomoxie.app/r/<deliveryId>`, which records `clickedAt` and then redirects to the apply target. **Details** opens the job page in the Mini App. (The Tailor-CV button joins later.)

## 12. Expiry and cleanup

An hourly job sets `status=expired` once the deadline passes, or 30 days after `firstSeenAt` when there's no deadline. Expired jobs are hidden from the feed, kept for dedup and SEO for 90 days, then `hidden`. `RawPost.pageText` is purged after 30 days.

## 13. Admin (minimal, in web `/admin`, `isAdmin` only)

- **Sources:** confirm handle candidates, join/pause, and per-source stats (posts/day, skipped %, jobs, unique jobs, first-seen share, extraction failures).
- **Review queue:** jobs with `professionId=null` or a `suspicious` flag. One click maps a title to a profession (adds an alias) or hides the job.
- **DLQ:** failed posts with a Retry button.
- **Settings:** batch interval, quiet hours, free daily cap, beta flag, plan limits.
- **Costs:** tokens per day, cost estimate, and average latency from post to sent.

## 14. Legal and etiquette

Show our own summary, not the full copied posting. Always credit the source with a link. Respect robots.txt and rate limits on sites. Once there's traffic to show, contact the bigger boards (Ethiojobs, HaHu, GeezJobs, Afriwork) about a partnership or feed.

## 15. Build order (milestone 3 → 4)

1. Migration: the models above plus `pg_trgm` (needs your OK, as pgvector did).
2. `apps/worker`: plain TypeScript process with a Postgres-backed queue (§2).
3. Listener: login script (prints `TG_SESSION`), handle resolution, live + catch-up into RawPost.
4. Pre-filter, enrichment, extraction (+ golden set eval), normalization.
5. Dedup/merge, expiry job.
6. Matching, delivery (instant/batch/urgent), click redirect, card format.
7. Admin pages for sources, review queue and DLQ.

## 16. Decisions (2026-11-19)

1. `pg_trgm` is enabled (migration `20261119000000_ingestion`).
2. Free tier: 15 jobs/day, batches every 2 h from 07:00 to 21:00 EAT.
3. Gender: optional user field. When set, jobs restricted to the other gender are skipped; when empty, they are sent with a label.
4. Overseas jobs are kept (`Job.isOverseas`, `country`) and only go to users who opt in (`UserPreferences.overseasOk`). Scam checks still apply.
5. The listener account is configured in `.env` (TG_API_ID, TG_API_HASH, TG_PHONE). Run `tg:login` once to create TG_SESSION.
6. Queue: Postgres (RawPost status) instead of Redis/BullMQ (see §2).
