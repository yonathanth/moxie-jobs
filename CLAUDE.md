# Ethio Jobs: working notes for Claude

Telegram-first job aggregator for Ethiopia. Users set preferences in a Mini App and get matching jobs as bot messages. CVs (create / improve / tailor to a job) are made by GoMoxie's engine (`../resume-back`, `routes/partner.routes.ts`, header `x-partner-key`, `PARTNER_API_KEYS` there; `GOMOXIE_API_URL` + `GOMOXIE_PARTNER_KEY` here). Ethio Jobs owns users, saved CVs (`CvDocument`) and billing.

## Database safety (read first)

`DATABASE_URL`/`DIRECT_URL` in `.env` point at a real Neon database.
- Never run `prisma migrate dev`, `migrate reset`, `db push`, `db execute`, or raw SQL that writes. Never pass a DB URL as `--shadow-database-url`.
- New migration: change `schema.prisma`, then `pnpm --filter @ethio/db migrate:diff` (offline, diffs against the last committed schema) → save into `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` → review → apply with `pnpm db:migrate:deploy`. Ask the user before applying.
- Safe anytime: `prisma generate`, `prisma validate`, `pnpm db:migrate:status`, `pnpm db:seed` (idempotent upserts, never deletes).
- Don't create/modify rows for testing; use unit tests.

## Layout

- `packages/shared`: enums (education, experience, employment types), cities, plan limits, the preferences Zod schema, API DTO types. Built to CJS `dist/`, so rebuild after edits (`turbo` does this for dev/build).
- `packages/db`: Prisma schema, migrations, taxonomy seed (`prisma/seed-data/taxonomy.ts`: job functions → professions with aliases incl. Amharic; fields of study). Taxonomy ids are stable slugs: never rename or reuse one.
- `apps/api`: NestJS. Modules: config (Zod-validated env), auth (Telegram Mini App initData → JWT; dev login gated by `ALLOW_DEV_AUTH`), users (`/me`), taxonomy (`/taxonomy`), preferences (`/me/preferences`), settings (admin `Setting` rows: `betaAllPro`, `planLimits`, `prices`, `delivery`), billing (SantimPay hosted checkout: `POST /billing/checkout`, webhook `/billing/santimpay/notify`; a payment is only activated after SantimPay's signed status API says COMPLETED), bot (grammY; polling in dev, webhook `/telegram/webhook` in prod; job-card Apply button is a callback `ap:<deliveryId>` answered with the tailored-CV question), jobs (`GET /jobs` feed, `GET /jobs/:id`; premium jobs redacted server-side for plans without them), health.
- `apps/worker`: plain TS process. Telegram listener (GramJS user account, `src/telegram`) → RawPost queue in Postgres → pipeline (`src/pipeline`: prefilter, enrich, Gemini extraction in `src/ai`, normalize, dedup/merge) → Job. Website sources (`src/web`, `Source.kind = "website"`: ReliefWeb API needing `RELIEFWEB_APPNAME`, African Union sitemap) feed the same RawPost queue. Delivery (`src/delivery`) matches new jobs to users and backfills a user's top open matches after each preferences save. Scripts: `tg:login` (one-time, interactive), `sources` (list/search/join channels), `extract:try` (run extraction on a text file). Spec: `docs/ingestion-spec.md`.
- `apps/web`: Next.js. `/` public landing; `/app` Mini App (overview, `/app/jobs` feed: For you / All jobs, search, URL-kept filters, keyset pagination + window virtualization capped at 300 items; `/app/jobs/[id]`; `/app/onboarding`, `/app/preferences`, `/app/plans`). Plan limits are enforced in the UI with `usePaywall().gate(reason)` (components/paywall.tsx); `/billing/return` is public (SantimPay redirects there outside Telegram). Look matches gomoxie.app (`../resume`): light only, tokens in `globals.css`, Geist, lucide icons, near-black primary buttons, orange accent used sparingly.

## Conventions

- Plans: free / pro / career. Limits come from `resolveLimits(effectivePlan(user, settings), settings)` and prices from `resolvePrices(settings)`, never hardcoded. Every plan gets instant alerts; free has `dailyJobCap` 10 and no `premiumJobs` (NGO, UN/AU/embassy, foreign company, overseas; see `isPremiumJob`). Locked premium matches are Delivery rows with status `locked`, counted in a once-a-day teaser (`teased`) and unlocked by the backfill after an upgrade. Beta = everyone Pro (`betaAllPro`, default true).
- Icons (user rule): never use lucide `Sparkles`, and never put emoji in the web/Mini App interface (headings, buttons, labels, empty states). Use lucide icons instead; job categories use `components/categoryIcons.tsx`, not the taxonomy `emoji` field.
- Delivery timing: new-job alerts respect quiet hours (settings.delivery.quietFromEat/quietToEat, default 22→7 EAT) via `sendTimeAfterQuiet`; backfills (user just acted) send immediately. Users who never finish setup get one reminder (worker `OnboardingNudge`, `User.onboardingNudgedAt`). Optional salary preference (`UserPreferences.salaryMin/Max`, monthly ETB) only skips jobs that state lower pay (`monthlySalaryEtb`).
- Bot copy has no emoji (same rule as the UI), with one user-approved exception: the wave (👋) on the first-time welcome greeting.
- Admin (Mini App → Admin, `/app/admin`, Telegram IDs in `ADMIN_TELEGRAM_IDS`; API `admin` module): review queue (approve → job active + flag `reviewed`, worker `ReviewWatcher` alerts if within `maxJobAgeHours`; reject → hidden), sources (stats, on/off, trust/priority, add by @handle → worker `JoinWatcher` joins one every 3 min; failures switch the source off with a note), prices & plan limits, beta, unpaid jobs (label | exclude), alert timing. Settings are Setting rows written with full values.
- Validation: Zod everywhere (`ZodValidationPipe` in the API); taxonomy/plan checks in `preferences.rules.ts` (pure, unit-tested).
- CVs (API `cv` module, rules in `cv.rules.ts`): charge order = free base CV (started from a job, never had a CV) → one free tailoring for everyone → plan allowance (`cvNewPerMonth`/`cvTailorPerMonth`, rolling 30 days, null = unlimited with `CV_FAIR_USE_PER_MONTH`) → `locked` (made now, watermarked PDF; unlock via `POST /billing/cv/:id/checkout`, `cvPrices` 49/19 Br) up to `unpaidCvCap`. Deleting is a soft delete (`deletedAt`) so usage can't be reset. PDFs go to the chat via `BotService.sendDocument`. Mini App tabs: Jobs | CVs | Profile (`/app`).
- CV score: `apps/web/src/lib/cv-score/engine.ts` is a verbatim copy of GoMoxie's engine (`../resume/src/lib/cv-score/engine.ts`); never edit it here, re-copy it. Job match uses requirements fetched at tailoring time (stored in `CvDocument.jobAnalysis.requirements`). AI polish / AI check (partner `/cv/polish`, `/cv/review`) are paid-plan only; polished content goes through `toPlainContent` (our bullets are strings).
- UI loading: page and list loads use shimmer skeletons (`components/skeletons.tsx`, `Skeleton`); spinners only for actions in progress. Icon tiles use GoMoxie tones (`IconTile tone=accent|sky|violet|emerald|neutral`); orange is for primary actions and paywalls. Never leave a `transform` on a page wrapper (it breaks `position: fixed` bars); the fade-up animation ends at `transform: none` for that reason.
- Bot copy lives in `bot.messages.ts` (HTML parse mode, escape user text with `escapeHtml`).
- Tests: vitest, pure functions (`pnpm test`). Typecheck: `pnpm typecheck`.

## Dev

```
pnpm install
pnpm --filter @ethio/shared build && pnpm --filter @ethio/db build
pnpm dev            # api :4000 (bot polling) + web :3000
```
Mini App buttons need https: run a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`), set `WEB_APP_URL` to it and add it to `CORS_ORIGINS`. Without Telegram, open http://localhost:3000/app with `NEXT_PUBLIC_DEV_AUTH=true`.
