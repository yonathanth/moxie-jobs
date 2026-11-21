/**
 * Job sources for the ingestion worker (see docs/ingestion-spec.md §3).
 *
 * Seeded into the Source table by prisma/seed.ts (idempotent).
 * `handle: null` = not confirmed yet; the listener resolves it by `title` on
 * first run and an admin confirms the match before the channel is joined.
 *
 * Avg views come from Telemetr (Nov 2026) and only guide priority; the
 * worker's own per-source stats (unique jobs contributed) replace them.
 */

export type SourceType =
  | "original" // a job board's own channel: first to post, has its own job pages
  | "repost" // general channel copying jobs from elsewhere
  | "niche" // focused on one sector (NGO, tech, health...)
  | "regional" // focused on one city/region
  | "newspaper" // newspaper vacancy sections (banks, government)
  | "employer"; // a single employer's channel

export type PostFormat =
  | "full" // the whole job (duties/requirements) is in the post: extract directly
  | "website_link" // teaser + link to a website page: fetch the page for details
  | "miniapp_link" // teaser + a t.me bot/Mini App button: use the post, link the button
  | "mixed"; // varies per post

export interface SourceSeed {
  key: string;
  /** "telegram" (default) = a channel read by the listener; "website" = an adapter in apps/worker/src/web. */
  kind?: "telegram" | "website";
  title: string;
  handle: string | null;
  type: SourceType;
  format: PostFormat;
  /** Domains whose pages we may fetch for details (format website_link/mixed). */
  websiteDomains: string[];
  /** 1 = start in MVP, 2 = add in weeks 2–3 after measuring tier 1. */
  tier: 1 | 2;
  /** 0–1. Below 0.5 = extraction must also pass the scam/quality check strictly. */
  trust: number;
  /** When the same job comes from several sources, the higher priority wins the apply link. */
  linkPriority: number;
  avgViews?: number;
  notes?: string;
}

export const SOURCES: SourceSeed[] = [
  // ── Tier 1: original boards ──────────────────────────────────────────────
  {
    key: "ethiojobs",
    title: "Ethiojobs",
    handle: "ethiojobsofficial",
    type: "original",
    format: "miniapp_link",
    websiteDomains: ["ethiojobs.net"],
    tier: 1,
    trust: 0.95,
    linkPriority: 90,
    avgViews: 5330,
    notes: "Near-full text in post (requirements, level, deadline). Apply button: t.me/ethiojobs_netbot?startapp=job_id_N.",
  },
  {
    key: "afriwork",
    title: "Afriwork (Freelance Ethiopia)",
    handle: "freelance_ethio",
    type: "original",
    format: "miniapp_link",
    websiteDomains: ["afriworket.com"],
    tier: 1,
    trust: 0.9,
    linkPriority: 90,
    avgViews: 9569,
    notes: "Labelled fields, description truncated. View Details button: t.me/afriworkapplicantbot/applicantapp?startapp=<uuid>. Also remote/freelance.",
  },
  {
    key: "hahujobs",
    title: "HaHuJobs",
    handle: "hahujobs",
    type: "original",
    format: "full",
    websiteDomains: ["hahu.jobs"],
    tier: 1,
    trust: 0.95,
    linkPriority: 90,
    avgViews: 4974,
    notes: "Most complete posts (duties, requirements, salary). Separate Details (hahu.jobs) and Apply (employer) buttons.",
  },
  {
    key: "geezjobs",
    title: "GeezJobs - Ethiopia Jobs",
    handle: "geezjobs_ethiopia",
    type: "original",
    format: "full",
    websiteDomains: ["geezjobs.com"],
    tier: 1,
    trust: 0.9,
    linkPriority: 85,
    avgViews: 4041,
    notes: "Summary + requirements in post. Detail: geezjobs.com/job-detail/<slug>, Apply: /job-application/<slug>.",
  },
  {
    key: "effoyjobs",
    title: "EffoyJobs - Effoysira.com",
    handle: "effoyjobs",
    type: "original",
    format: "website_link",
    websiteDomains: ["effoysira.com"],
    tier: 1,
    trust: 0.85,
    linkPriority: 75,
    avgViews: 54873,
    notes: "Teaser listing several positions per post. Fetch effoysira.com page. Some Amharic posts.",
  },
  {
    key: "harmeejobs",
    title: "Harmeejobs.com",
    handle: "harmeejobs",
    type: "original",
    format: "website_link",
    websiteDomains: ["harmeejobs.com"],
    tier: 1,
    trust: 0.8,
    linkPriority: 70,
    avgViews: 50466,
  },
  {
    key: "elelanajobs",
    title: "Elelanajobs.com",
    handle: "elelanajobs",
    type: "original",
    format: "website_link",
    websiteDomains: ["elelanajobs.com", "kebenajobs.com"],
    tier: 1,
    trust: 0.8,
    linkPriority: 70,
    avgViews: 18543,
    notes: "Teaser + elelanajobs.com/YYYY/MM/DD/<slug>. Occasionally links kebenajobs.com.",
  },
  {
    key: "fanajobs",
    title: "Fanajobs",
    handle: "fanajobs",
    type: "original",
    format: "mixed",
    websiteDomains: [],
    tier: 1,
    trust: 0.75,
    linkPriority: 65,
    avgViews: 28265,
    notes: "Format unverified; check on first run.",
  },
  {
    key: "ethiopian_reporter_jobs",
    title: "EthiopianReporterJobs.com",
    handle: "ethreporterjobs",
    type: "newspaper",
    format: "website_link",
    websiteDomains: ["ethiopianreporterjobs.com"],
    tier: 1,
    trust: 0.8,
    linkPriority: 70,
    avgViews: 17407,
    notes: "Newspaper vacancies: banks, government, big employers.",
  },

  // ── Tier 1: high-reach general, niche, regional ──────────────────────────
  {
    key: "amharajobs",
    title: "Amharajobs",
    handle: "amharajobs",
    type: "regional",
    format: "mixed",
    websiteDomains: [],
    tier: 1,
    trust: 0.7,
    linkPriority: 50,
    avgViews: 72345,
    notes: "Highest engagement in the ranking (82%). Amhara region; likely Amharic-heavy.",
  },
  {
    key: "miki_jobs",
    title: "Miki Jobs (MJ)",
    handle: "mikijobsmj",
    type: "repost",
    format: "mixed",
    websiteDomains: [],
    tier: 1,
    trust: 0.65,
    linkPriority: 40,
    avgViews: 32417,
  },
  {
    key: "ethio_job_vacancy_r",
    title: "Ethio Job Vacancy ®️",
    handle: "ethio_job_vacancy1",
    type: "repost",
    format: "mixed",
    websiteDomains: [],
    tier: 1,
    trust: 0.6,
    linkPriority: 40,
    avgViews: 17819,
  },
  {
    key: "embassy_ngo_jobs",
    title: "Embassy & NGO jobs®️🇪🇹",
    handle: "jobs_in_ethio",
    type: "niche",
    format: "mixed",
    websiteDomains: [],
    tier: 1,
    trust: 0.7,
    linkPriority: 55,
    avgViews: 12918,
    notes: "NGO / embassy / UN roles.",
  },
  {
    key: "ethiopian_airlines",
    title: "Ethiopian Airlines Vacancy",
    handle: "EthiopianAirlines_Vacancy",
    type: "employer",
    format: "mixed",
    websiteDomains: ["ethiopianairlines.com"],
    tier: 1,
    trust: 0.8,
    linkPriority: 80,
    avgViews: 5269,
    notes: "Verified channel. Confirm it is the airline's own before trusting fully.",
  },
  {
    key: "josad_software",
    title: "Josad Software Jobs",
    handle: "josad_software",
    type: "niche",
    format: "mixed",
    websiteDomains: [],
    tier: 1,
    trust: 0.7,
    linkPriority: 55,
    avgViews: 2808,
    notes: "Tech jobs incl. remote/freelance; some unpaid listings (flag them).",
  },

  // ── Tier 2: add after measuring tier 1 ───────────────────────────────────
  { key: "ethioworks", title: "Ethioworks.com ክፍት የሥራ ቦታ በኢትዮጵያ", handle: null, type: "original", format: "website_link", websiteDomains: ["ethioworks.com"], tier: 2, trust: 0.75, linkPriority: 65, avgViews: 6517 },
  { key: "shegerjobs", title: "Shegerjobs.com", handle: null, type: "original", format: "website_link", websiteDomains: ["shegerjobs.com"], tier: 2, trust: 0.75, linkPriority: 65, avgViews: 5012 },
  { key: "abayjobs", title: "Abayjobs.com አባይ ስራዎች", handle: null, type: "original", format: "website_link", websiteDomains: ["abayjobs.com"], tier: 2, trust: 0.75, linkPriority: 65, avgViews: 3245 },
  { key: "merihjobs", title: "MerihJobs.com", handle: null, type: "original", format: "website_link", websiteDomains: ["merihjobs.com"], tier: 2, trust: 0.7, linkPriority: 60, avgViews: 6808 },
  { key: "peakjobs", title: "Peakjobs", handle: null, type: "original", format: "mixed", websiteDomains: [], tier: 2, trust: 0.7, linkPriority: 60, avgViews: 1962 },
  { key: "gize_jobs", title: "Gize Jobs", handle: null, type: "repost", format: "mixed", websiteDomains: [], tier: 2, trust: 0.65, linkPriority: 40, avgViews: 4277 },
  { key: "ethio_jobs_hub", title: "Ethio Jobs Hub", handle: "Ethiojobshubs", type: "repost", format: "mixed", websiteDomains: [], tier: 2, trust: 0.65, linkPriority: 40, avgViews: 10549 },
  { key: "worklink", title: "WorkLink Ethiopia", handle: "WorkLinkETH", type: "repost", format: "mixed", websiteDomains: [], tier: 2, trust: 0.65, linkPriority: 40, avgViews: 6832 },
  { key: "etcareers", title: "Etcareers.com / Jobs in Ethiopia", handle: "Etcareersjobs", type: "original", format: "website_link", websiteDomains: ["etcareers.com"], tier: 2, trust: 0.75, linkPriority: 65, notes: "Some remote non-Ethiopia roles: keep only if open to Ethiopia." },
  { key: "ngo_jobs_vacancy", title: "NGO jobs + Vacancy", handle: null, type: "niche", format: "mixed", websiteDomains: [], tier: 2, trust: 0.65, linkPriority: 50, avgViews: 9813 },
  { key: "ngo_jobs_ethiopia", title: "NGO jobs Ethiopia", handle: null, type: "niche", format: "mixed", websiteDomains: [], tier: 2, trust: 0.65, linkPriority: 50, avgViews: 5596 },
  { key: "ethio_health_jobs", title: "Ethio Health Jobs®", handle: null, type: "niche", format: "mixed", websiteDomains: [], tier: 2, trust: 0.65, linkPriority: 50, avgViews: 3813 },
  { key: "construction_jobs", title: "Construction Job Vacancies ስራ", handle: "constructionvacancies", type: "niche", format: "mixed", websiteDomains: [], tier: 2, trust: 0.6, linkPriority: 45, avgViews: 11520 },
  { key: "construction_vacancy_tender", title: "Ethiopian Construction Vacancy & Tender", handle: null, type: "niche", format: "mixed", websiteDomains: [], tier: 2, trust: 0.6, linkPriority: 45, avgViews: 2384, notes: "Mixes tenders: drop non-job posts." },
  { key: "mela_callcenter", title: "Mela Callcenter vaccancy", handle: null, type: "niche", format: "mixed", websiteDomains: [], tier: 2, trust: 0.6, linkPriority: 45, avgViews: 5814 },
  { key: "hawassa_jobs", title: "Hawassa Jobs", handle: null, type: "regional", format: "mixed", websiteDomains: [], tier: 2, trust: 0.6, linkPriority: 40, avgViews: 3447 },
  { key: "adama_jobs", title: "Adama Jobs", handle: null, type: "regional", format: "mixed", websiteDomains: [], tier: 2, trust: 0.6, linkPriority: 40, avgViews: 5748 },
  { key: "amhara_jobs", title: "Amhara Jobs", handle: null, type: "regional", format: "mixed", websiteDomains: [], tier: 2, trust: 0.6, linkPriority: 40, avgViews: 13550, notes: "Same channel as amharajobs (tier 1, @amharajobs): do not join." },
  { key: "dire_dawa_mak", title: "Job Vacancy in Dire Dawa Harar Somali Ethiopia (MAK Adverts)", handle: null, type: "regional", format: "mixed", websiteDomains: [], tier: 2, trust: 0.6, linkPriority: 40, avgViews: 2830 },
  { key: "fva_finfine", title: "FVA_FINFINE VACANCY ANNOUNCEMENT", handle: null, type: "regional", format: "mixed", websiteDomains: [], tier: 2, trust: 0.6, linkPriority: 40, avgViews: 1425 },
  { key: "addis_zemen", title: "አዲስ ዘመን ጋዜጣ| Addis Zemen Vacancy", handle: "addis_zemen_vacancy", type: "newspaper", format: "website_link", websiteDomains: ["reportervacancy.com"], tier: 2, trust: 0.45, linkPriority: 50, avgViews: 2751, notes: "Mixes scam-like posts (work visas, 'make money online'). Strict quality check." },
  { key: "reporter_vacancy", title: "Reporter Vacancy |ሪፖርተር ጋዜጣ", handle: "reporter_vacancy", type: "newspaper", format: "website_link", websiteDomains: ["reportervacancy.com"], tier: 2, trust: 0.6, linkPriority: 50, avgViews: 1771 },
  { key: "kira_jobs", title: "Kira jobs", handle: "kirajobs", type: "repost", format: "mixed", websiteDomains: [], tier: 2, trust: 0.55, linkPriority: 35, avgViews: 9631 },
  { key: "abisinya_vacancy", title: "አቢሲኒያ አስቸኳይ የስራ ማስታወቂያ Abisinya vacancyJobs 🔊", handle: null, type: "repost", format: "mixed", websiteDomains: [], tier: 2, trust: 0.55, linkPriority: 35, avgViews: 8213 },
  { key: "abilink", title: "AbiLink 🔗", handle: null, type: "repost", format: "mixed", websiteDomains: [], tier: 2, trust: 0.55, linkPriority: 35, avgViews: 8074 },
  { key: "opportunity_alerts", title: "Opportunity Alerts📢", handle: null, type: "repost", format: "mixed", websiteDomains: [], tier: 2, trust: 0.5, linkPriority: 30, avgViews: 6356, notes: "May mix scholarships/trainings: drop non-jobs." },
  { key: "arif_jobs", title: "Arif Jobs", handle: null, type: "repost", format: "mixed", websiteDomains: [], tier: 2, trust: 0.55, linkPriority: 35, avgViews: 4683 },

  // ── Websites (no Telegram channel; adapters in apps/worker/src/web) ───────
  {
    key: "reliefweb",
    kind: "website",
    title: "ReliefWeb",
    handle: null,
    type: "niche",
    format: "full",
    websiteDomains: ["reliefweb.int"],
    tier: 1,
    trust: 0.95,
    linkPriority: 80,
    notes: "API v2, country = ETH. Needs RELIEFWEB_APPNAME. Promised on the appname request: summaries only, always link back.",
  },
  {
    key: "african_union",
    kind: "website",
    title: "African Union Careers",
    handle: null,
    type: "employer",
    format: "full",
    websiteDomains: ["jobs.au.int"],
    tier: 1,
    trust: 0.98,
    linkPriority: 85,
    notes: "SuccessFactors: sitemap.xml + job pages (robots.txt allows; /services/ does not). English (en_US) pages only.",
  },
];

/**
 * Seen in the ranking and deliberately excluded:
 * - Dead (<~300 avg views): Beleqet Jobs (both), Oro Jobs, Qubee Jobs, EthioOnlineJobs, ETHIO JOBS 1,
 *   Enat Jobs, Gebeya Connect, Maroset, ትኩስ የስራ ማስታወቂያዎች, Ethio Job Vacancy (#55).
 * - Not Ethiopian jobs: Software & IT Jobs in Egypt, Somalijobs Inc, Safaricom & NGO Jobs, Kuwait Jobs and Updates.
 * - Not jobs: Afaan Oromoo Music, Best Shoes, CryptoJobHub, Crypto Scope, RAS MACHINERY, Habesha casting,
 *   Yisabel casting, Future pilots, Info.
 * - Low-engagement repost duplicates (revisit only if data shows unique jobs): Ethio Jobs Vacancy™ (377K subs,
 *   1.3% reach), Ethio daily vacancy, Ethio-Job-Vacancy🇪🇹, Ethiopian vacancy, Skills Ethiopia, and the remaining
 *   small "Ethio Job(s) Vacancy" variants.
 */
