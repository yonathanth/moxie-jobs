import type { BillingPeriod, PaidPlan, Plan } from "./enums";
import type { City } from "./locations";
import type { CvPackId, CvProduct, PlanLimits, PriceTable } from "./plans";
import type { Preferences } from "./preferences";

/** Response shapes shared by the API and the web app. */

export interface ProfessionDto {
  id: string;
  name: string;
  functionId: string;
  aliases: string[];
}

export interface JobFunctionDto {
  id: string;
  name: string;
  emoji: string | null;
  professions: ProfessionDto[];
}

export interface FieldOfStudyDto {
  id: string;
  name: string;
  aliases: string[];
}

export interface TaxonomyDto {
  functions: JobFunctionDto[];
  fieldsOfStudy: FieldOfStudyDto[];
  cities: readonly City[];
}

export interface MeDto {
  id: string;
  telegramId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  /** Plan paid for (free when none or expired). */
  plan: Plan;
  /** When the paid plan ends (ISO), null when free. */
  planExpiresAt: string | null;
  /** Plan used for limits right now (e.g. everyone is pro during the beta). */
  effectivePlan: Plan;
  /** True while the beta gives everyone Pro. */
  beta: boolean;
  limits: PlanLimits;
  alertsPaused: boolean;
  onboarded: boolean;
  isAdmin: boolean;
  stats: MeStats;
  /** Personal details for CVs, asked once in the CV flow; null until then. */
  cvContact: CvContact | null;
}

/** Printed at the top of every CV. Edited in Profile → CV details. */
export interface CvContact {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface MeStats {
  /** Job alerts sent today (Addis Ababa day). */
  sentToday: number;
  sentThisWeek: number;
  /** Premium jobs matched in the last 7 days that the plan doesn't include. */
  lockedThisWeek: number;
  /** Matches held back today by the daily alert limit (waiting in the feed). */
  waitingToday: number;
}

export interface PricingDto {
  currency: "ETB";
  prices: PriceTable;
  limits: Record<Plan, PlanLimits>;
  packs: CvPackDto[];
}

/** Buy a CV pack; with cvId, one of its credits unlocks that CV straight away. */
export interface PackCheckoutRequest {
  pack: CvPackId;
  cvId?: string;
}

export interface CheckoutRequest {
  plan: PaidPlan;
  period: BillingPeriod;
}

export interface CheckoutResponse {
  paymentId: string;
  /** SantimPay hosted checkout page. */
  url: string;
}

export interface PaymentDto {
  id: string;
  /** A plan, a CV pack, or (old payments) a single CV. */
  plan: PaidPlan | CvPackId | CvProduct;
  period: BillingPeriod | "one_time";
  amount: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  /** When the plan bought by this payment ends (paid only). */
  periodEnd: string | null;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  me: MeDto;
}

export type PreferencesDto = Preferences & { updatedAt: string };

/** One job in the Mini App feed or detail view. Locked jobs carry only teaser fields. */
export interface JobCardDto {
  id: string;
  title: string;
  /** Premium job the user's plan doesn't include: details are withheld. */
  locked: boolean;
  /** Why it's locked: a kind of job the plan doesn't include ("premium"), or a match over today's free alert limit (opens tomorrow). */
  lockReason: "premium" | "daily_limit" | null;
  /** NGO, UN/AU/embassy, foreign company or overseas: shares never name the employer. */
  premium: boolean;
  /** Why it's in "For you": sent as an alert, held by the daily limit, or locked (premium). */
  match: "sent" | "waiting" | "locked" | null;
  /** The user bookmarked it (Saved tab). */
  saved: boolean;
  /** Job category (taxonomy function id), for the category icon. */
  functionId: string | null;
  employerType: string | null;
  employerLabel: string | null;
  company: string | null;
  location: string | null;
  experience: string | null;
  education: string | null;
  jobType: string | null;
  salary: string | null;
  gender: string | null;
  deadline: string | null;
  firstSeenAt: string;
  summary: string | null;
  skills: string[];
  /** Key requirements from the post (newer jobs; empty for older ones). */
  requirements: string[];
  notStated: string[];
  apply: {
    /** Where the Apply button leads (employer link, their Telegram, or the original post). */
    url: string | null;
    label: string;
    /** Email / phone / in-person instructions, when the button can't do it alone. */
    how: string | null;
  } | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

/** for_you = matches, all = browse, saved = bookmarked (newest save first; closed jobs included). */
export const FEED_SCOPES = ["for_you", "all", "saved"] as const;
export type FeedScope = (typeof FEED_SCOPES)[number];

export const POSTED_WITHIN = ["1d", "3d", "7d", "30d"] as const;
export type PostedWithin = (typeof POSTED_WITHIN)[number];

export const EMPLOYER_FILTERS = ["private", "government", "ngo", "international", "foreign"] as const;
export type EmployerFilter = (typeof EMPLOYER_FILTERS)[number];

export interface JobFeedQuery {
  scope: FeedScope;
  q?: string;
  cities?: string[];
  employmentTypes?: string[];
  employers?: EmployerFilter[];
  remote?: boolean;
  postedWithin?: PostedWithin;
  /** Deadline within 3 days. */
  closingSoon?: boolean;
  /** Only jobs that state a salary figure. */
  salaryStated?: boolean;
  /** Jobs like this one (same profession, else same category), excluding it. */
  similarTo?: string;
  cursor?: string;
  limit?: number;
}

/** GET /me/messaging: whether the bot can message them (null = unknown, e.g. the bot is off in local dev). */
export interface MessagingStatusDto {
  canMessage: boolean | null;
}

export interface JobFeedPage {
  items: JobCardDto[];
  /** Opaque; pass back as `cursor` for the next page. Null at the end. */
  nextCursor: string | null;
  /** First page only: how many locked (premium) matches the plan hides, for the upsell row. */
  lockedCount?: number;
  /** "For you", first page: the worker is still matching their latest preferences (just set up or edited). Poll until false. */
  matching?: boolean;
  /** "For you", first page, plans with a daily limit: today's matches over the limit (they open tomorrow), kept out of the list and shown as one row. */
  held?: { count: number; items: JobCardDto[] };
}

/** A shared job link (public, no sign-in): enough to want it; applying happens in the bot. */
export interface PublicJobDto {
  id: string;
  title: string;
  company: string | null;
  employerLabel: string | null;
  location: string | null;
  jobType: string | null;
  experience: string | null;
  salary: string | null;
  deadline: string | null;
  firstSeenAt: string;
  /** First sentences of the summary; null for premium jobs. */
  teaser: string | null;
  skills: string[];
  closed: boolean;
}

/** "Not listed" entry typed in a picker: mapped to the closest taxonomy entries. */
export interface ResolveTermRequest {
  kind: "field" | "profession";
  text: string;
}

export interface ResolveTermResponse {
  /** Closest matching ids (0–3); empty = nothing close. */
  ids: string[];
}

/* ---------- Admin (Telegram IDs in ADMIN_TELEGRAM_IDS) ---------- */

export interface AdminOverviewDto {
  users: { total: number; onboarded: number; paid: number; newThisWeek: number };
  jobs: { active: number; review: number; newToday: number };
  alertsToday: number;
  sources: { active: number; joinPending: number };
  /** ETB from paid payments in the last 30 days. */
  revenue30d: number;
  beta: boolean;
}

export interface ReviewJobDto {
  id: string;
  title: string;
  company: string | null;
  employerLabel: string | null;
  /** Why it was held: "Asks applicants to pay", "Looks suspicious", "Couldn't classify". */
  reasons: string[];
  unclassified: boolean;
  firstSeenAt: string;
  summary: string;
  location: string | null;
  deadline: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  /** The original post (trimmed), to judge it. */
  postText: string | null;
}

export interface ReviewPage {
  items: ReviewJobDto[];
  nextCursor: string | null;
  total: number;
}

export interface AdminSourceDto {
  id: string;
  title: string;
  handle: string | null;
  kind: string;
  type: string;
  tier: number;
  isActive: boolean;
  joined: boolean;
  /** Added from the admin and waiting for the worker to join it. */
  joinPending: boolean;
  trust: number;
  linkPriority: number;
  posts7d: number;
  jobs7d: number;
  lastPostAt: string | null;
  notes: string | null;
}

export interface AdminSettingsDto {
  betaAllPro: boolean;
  unpaidJobs: "label" | "exclude";
  delivery: { maxJobAgeHours: number; digestHourEat: number; quietFromEat: number; quietToEat: number };
  prices: PriceTable;
  planLimits: Record<Plan, PlanLimits>;
  cvPackPrices: Record<CvPackId, number>;
  unpaidCvCap: number;
}

export const ADMIN_USER_PLAN_FILTERS = ["all", "free", "pro", "career", "expired"] as const;
export type AdminUserPlanFilter = (typeof ADMIN_USER_PLAN_FILTERS)[number];
export const ADMIN_USER_STATUS_FILTERS = ["all", "set_up", "not_set_up", "paused", "blocked"] as const;
export type AdminUserStatusFilter = (typeof ADMIN_USER_STATUS_FILTERS)[number];

export interface AdminUserRow {
  id: string;
  telegramId: string;
  name: string;
  username: string | null;
  /** Active paid plan, else "free". */
  plan: Plan;
  planExpiresAt: string | null;
  /** Had a paid plan that has ended. */
  expired: boolean;
  onboarded: boolean;
  alertsPaused: boolean;
  blocked: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  alerts7d: number;
}

export interface AdminUsersPage {
  items: AdminUserRow[];
  nextCursor: string | null;
  total: number;
}

export interface AdminUserDetail extends AdminUserRow {
  /** Deep-link source of their first /start (e.g. "fb_ad"). */
  startParam: string | null;
  preferences: {
    professions: string[];
    categories: string[];
    degrees: string[];
    cities: string[];
    experience: string | null;
    salary: string | null;
  } | null;
  stats: { alertsTotal: number; clicksTotal: number; lockedTotal: number };
  /** Real payments and manual changes by admins (provider "admin", amount 0, status "granted" | "removed"). */
  payments: { id: string; plan: string; period: string; amount: number; status: string; createdAt: string; paidAt: string | null; byAdmin: string | null }[];
}

export interface AdminGrantPlan {
  /** "free" removes any paid plan. */
  plan: Plan;
  /** Days to add (paid plans): extends the same plan from its end, else starts now. */
  days?: number;
}

/* ---------- CVs (GoMoxie engine) ---------- */

/** GoMoxie's canonical CV shape (kept loose here; the engine validates it). */
export interface CvContent {
  personal: { full_name?: string; title?: string; email?: string; phone?: string; location?: string; links?: { label: string; url: string }[] };
  summary?: string;
  experience?: { company?: string; role?: string; location?: string; start_date?: string; end_date?: string; bullets?: string[] }[];
  education?: { institution?: string; degree?: string; field?: string; start_date?: string; end_date?: string; honors?: string }[];
  skills?: string[];
  certifications?: { name?: string; issuer?: string; date?: string; url?: string }[];
  projects?: { name?: string; description?: string; tech?: string[]; url?: string }[];
  languages?: { language?: string; proficiency?: string }[];
  [section: string]: unknown;
}

export interface CvSummaryDto {
  id: string;
  title: string;
  kind: "base" | "tailored";
  flow: "create" | "improve" | "tailor";
  templateId: string;
  /** Made but not paid for: downloads are watermarked until unlocked. */
  locked: boolean;
  jobId: string | null;
  jobTitle: string | null;
  updatedAt: string;
}

export interface CvDetailDto extends CvSummaryDto {
  content: CvContent;
  baseCvId: string | null;
  /** Tailored CVs: requirements the person may not meet ("Team supervision"). */
  gaps: string[];
  /** Locked CVs: pack credits of the right kind the person has (≥1 = unlock without paying now). */
  unlockCredits: number;
  /** Follow-up questions the engine asked, to make the CV stronger. */
  questions: { id: string; question: string; reason?: string }[];
  /** Tailored CVs: what the job asks for (drives the score's job match). */
  jobRequirements: CvJobRequirements | null;
  /** AI polish and AI check are included in the person's plan. */
  canPolish: boolean;
}

/** What a job asks for, as GoMoxie's score engine reads it. */
export interface CvJobRequirements {
  title: string;
  seniority?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  keywords?: string[];
}

export type CvPolishTarget = { kind: "summary" } | { kind: "bullets"; index?: number } | { kind: "skills" } | { kind: "headline" };

export interface CvPolishResponse {
  /** The CV with the rewrites applied (not saved yet; the editor decides). */
  content: CvContent;
  score: number;
  projectedScore: number;
}

export interface CvReviewTip {
  text: string;
  section?: string;
}

export interface CvPackDto {
  id: CvPackId;
  name: string;
  price: number;
  newCvs: number;
  tailored: number;
}

export interface CvQuotaDto {
  plan: Plan;
  /** Packs on sale (credits that never expire). */
  packs: CvPackDto[];
  /** Pack credits left. */
  credits: { new: number; tailor: number };
  /** Left in the current 30 days; null = unlimited. */
  newLeft: number | null;
  tailorLeft: number | null;
  /** The one free tailoring for everyone is still available. */
  freeTailoringAvailable: boolean;
  unpaidCount: number;
  unpaidCap: number;
}

export interface CvListDto {
  items: CvSummaryDto[];
  quota: CvQuotaDto;
}

export interface CvGenerateRequest {
  flow: "create" | "improve" | "tailor";
  /** create/improve: what the person told us, or their imported CV's text. */
  sourceText?: string;
  name?: string;
  email?: string;
  phone?: string;
  /** City / country line, e.g. "Addis Ababa, Ethiopia". */
  location?: string;
  /** improve: what to focus on ("make it more senior"). */
  focus?: string;
  /** tailor: the job, and the base CV to tailor (default: the newest base CV). improve: a saved CV to improve (instead of sourceText). */
  jobId?: string;
  baseCvId?: string;
  /** create started from "tailor this job" with no CV yet: the base CV is free. */
  forJobId?: string;
  templateId?: string;
}

export type CvGenerateResponse =
  | { status: "ok"; cv: CvDetailDto }
  /** Tailoring: the person's background doesn't fit this job at all. */
  | { status: "mismatch"; reason: string; missing: string[] };

export interface CvTemplateDto {
  id: string;
  name: string;
  category: string;
  /** Picture of the template with sample content. */
  previewUrl: string;
}

/** Marketing messages an admin can send by hand (Admin → Broadcast). */
export const BROADCAST_KINDS = ["upgrade", "cv", "packs", "setup", "premium"] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];
/** Who gets it. Blocked and paused people never do. */
export const BROADCAST_AUDIENCES = ["free", "paid", "everyone", "no_cv", "not_set_up"] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export interface BroadcastRequest {
  kind: BroadcastKind;
  audience: BroadcastAudience;
  /** premium: the job to show (its employer stays hidden). */
  jobId?: string;
  /** Send only to the admin asking. */
  test?: boolean;
}

export interface BroadcastResult {
  /** People who will get it (1 for a test). */
  count: number;
}
