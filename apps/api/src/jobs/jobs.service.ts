import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Job, Prisma, User } from "@ethio/db";
import { EMPLOYER_TYPES, effectivePlan, employerLabel, isPremiumJob, locationText, resolveLimits, startOfDayEat, type JobCardDto, type JobFeedPage, type JobFeedQuery, type PostedWithin, type PublicJobDto } from "@ethio/shared";
import { BotService } from "../bot/bot.service";
import { jobShareCaption } from "../bot/bot.messages";
import { ENV, type Env } from "../config/config.module";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { balanceTop, decodeCursor, employerTypes, encodeCursor, searchTerms, toCard, toPublic } from "./jobs.mapper";

const DAY = 24 * 3_600_000;
const POSTED_MS: Record<PostedWithin, number> = { "1d": DAY, "3d": 3 * DAY, "7d": 7 * DAY, "30d": 30 * DAY };
/** "All jobs" never reaches further back than this, whatever the filters. */
const ALL_JOBS_WINDOW_MS = 30 * DAY;
/** Deliveries shown in "For you": sent alerts, ones held by the daily limit, and locked premium matches. */
// Everything matched to them: sent, on its way (pending/sending), held by the daily limit, locked, or not
// deliverable because the bot can't message them yet (still a match; it shows here).
const FOR_YOU: Prisma.DeliveryWhereInput = {
  OR: [
    { status: { in: ["sent", "pending", "sending", "locked", "teased"] } },
    { status: "skipped", error: "daily_cap" },
    { status: "failed", error: "chat_not_found" },
  ],
};
/** Matching after a preferences save normally takes seconds; past this, stop showing "finding matches". */
const MATCHING_MAX_MS = 2 * 60_000;
/** NGO, international organization, embassy, foreign company or abroad (`isPremiumJob`), as a job filter. */
const PREMIUM_JOB: Prisma.JobWhereInput = {
  OR: [{ employerType: { in: EMPLOYER_TYPES.filter((e) => e.premium).map((e) => e.id) } }, { isOverseas: true }],
};
/** Today's held matches, all shown in the "N more matches today" sheet (a free day rarely holds more than a few dozen). */
const HELD_SHOWN = 200;
const LOOKUP_TTL_MS = 10 * 60_000;

/**
 * Why a job is in "For you". "waiting" = held by today's free alert limit: locked until tomorrow (Addis Ababa).
 * heldFrom = start of today for plans with a daily limit, null otherwise (nothing is held then).
 */
function matchOf(d: { status: string; error: string | null; createdAt: Date }, heldFrom: Date | null): JobCardDto["match"] {
  if (d.status === "sent" || d.status === "pending" || d.status === "sending") return "sent";
  if (d.status === "locked" || d.status === "teased") return "locked";
  if (d.status === "skipped" && d.error === "daily_cap") return heldFrom && d.createdAt >= heldFrom ? "waiting" : null;
  return null;
}

@Injectable()
export class JobsService {
  private lookups: { at: number; fieldNames: Map<string, string>; sourceTitles: Map<string, string> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly bot: BotService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async lookupMaps() {
    if (this.lookups && Date.now() - this.lookups.at < LOOKUP_TTL_MS) return this.lookups;
    const [fields, sources] = await Promise.all([
      this.prisma.fieldOfStudy.findMany({ select: { id: true, name: true } }),
      this.prisma.source.findMany({ select: { id: true, title: true } }),
    ]);
    this.lookups = {
      at: Date.now(),
      fieldNames: new Map(fields.map((f) => [f.id, f.name])),
      sourceTitles: new Map(sources.map((s) => [s.id, s.title])),
    };
    return this.lookups;
  }

  private async userView(user: User): Promise<{ premiumJobs: boolean; excludeUnpaid: boolean; heldFrom: Date | null }> {
    const settings = await this.settings.get();
    const limits = resolveLimits(effectivePlan(user, settings), settings);
    return {
      premiumJobs: limits.premiumJobs,
      excludeUnpaid: settings.unpaidJobs === "exclude",
      // Matches over today's free limit stay locked until tomorrow; plans without a limit see everything.
      heldFrom: limits.dailyJobCap === null ? null : startOfDayEat(new Date()),
    };
  }

  /** "Similar jobs": same profession when known, else same category; never the job itself. */
  private async similarWhere(jobId: string): Promise<Prisma.JobWhereInput> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, select: { professionId: true, functionId: true } });
    if (!job || (!job.professionId && !job.functionId)) return { id: "00000000-0000-0000-0000-000000000000" }; // nothing to compare: empty
    return {
      id: { not: jobId },
      ...(job.professionId ? { professionId: job.professionId } : { functionId: job.functionId }),
    };
  }

  /** Jobs matching the search and filters: open ones only, or (saved tab) closed ones too. */
  private jobWhere(q: JobFeedQuery, now: Date, excludeUnpaid = false, openOnly = true): Prisma.JobWhereInput {
    const and: Prisma.JobWhereInput[] = openOnly
      ? [{ status: "active" }, { OR: [{ deadline: null }, { deadline: { gt: now } }] }]
      : [{ status: { in: ["active", "expired"] } }];
    if (excludeUnpaid) and.push({ NOT: { OR: [{ qualityFlags: { has: "unpaid" } }, { employmentType: "volunteer" }] } });
    for (const term of searchTerms(q.q)) {
      and.push({
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { company: { contains: term, mode: "insensitive" } },
          { summary: { contains: term, mode: "insensitive" } },
        ],
      });
    }
    if (q.cities?.length) and.push({ locationIds: { hasSome: q.cities } });
    if (q.employmentTypes?.length) and.push({ employmentType: { in: q.employmentTypes } });
    if (q.employers?.length) and.push({ employerType: { in: employerTypes(q.employers) } });
    if (q.remote) and.push({ workMode: "remote" });
    if (q.postedWithin) and.push({ firstSeenAt: { gte: new Date(now.getTime() - POSTED_MS[q.postedWithin]) } });
    if (q.closingSoon) and.push({ deadline: { not: null, lte: new Date(now.getTime() + 3 * DAY) } });
    if (q.salaryStated) and.push({ OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }] });
    return { AND: and };
  }

  async feed(user: User, q: JobFeedQuery): Promise<JobFeedPage> {
    const now = new Date();
    const limit = Math.min(Math.max(q.limit ?? 20, 5), 30);
    const cursor = decodeCursor(q.cursor);
    const [{ premiumJobs, excludeUnpaid, heldFrom }, maps] = await Promise.all([this.userView(user), this.lookupMaps()]);
    const card = (job: Job, match: JobCardDto["match"], saved: boolean) => toCard(job, { premiumJobs, match, saved, heldToday: match === "waiting", ...maps });

    if (q.scope === "saved") {
      const rows = await this.prisma.savedJob.findMany({
        where: {
          userId: user.id,
          job: this.jobWhere(q, now, false, false),
          ...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, jobId: { lt: cursor.id } }] } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { jobId: "desc" }],
        take: limit + 1,
        include: { job: true },
      });
      const page = rows.slice(0, limit);
      const matches = await this.matchesFor(user.id, page.map((r) => r.jobId), heldFrom);
      const last = rows[limit - 1];
      return {
        items: page.map((r) => card(r.job, matches.get(r.jobId) ?? null, true)),
        nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.jobId) : null,
      };
    }

    if (q.scope === "for_you") {
      // Today's matches over the free limit stay out of the list: one "N more matches today" row holds them.
      const heldToday: Prisma.DeliveryWhereInput | null = heldFrom ? { status: "skipped", error: "daily_cap", createdAt: { gte: heldFrom } } : null;
      const rows = await this.prisma.delivery.findMany({
        where: {
          userId: user.id,
          job: this.jobWhere(q, now, excludeUnpaid),
          ...(heldToday ? { NOT: heldToday } : {}),
          AND: [FOR_YOU, ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }] : [])],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: { job: true },
      });
      let page = rows.slice(0, limit);
      const last = rows[limit - 1];
      // First page: NGO/embassy/international jobs only in 2nd and 4th place (at least one when they have one).
      if (!cursor) {
        const extra = page.slice(0, 5).some((d) => isPremiumJob(d.job))
          ? []
          : await this.prisma.delivery.findMany({
              where: {
                userId: user.id,
                job: { AND: [this.jobWhere(q, now, excludeUnpaid), PREMIUM_JOB] },
                ...(heldToday ? { NOT: heldToday } : {}),
                AND: [FOR_YOU],
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              include: { job: true },
            });
        page = balanceTop(page, extra, (d) => isPremiumJob(d.job), (d) => d.jobId);
      }
      const where = { userId: user.id, job: this.jobWhere(q, now, excludeUnpaid) };
      const [held, heldCount] =
        heldToday && !cursor
          ? await Promise.all([
              this.prisma.delivery.findMany({ where: { ...where, ...heldToday }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HELD_SHOWN, include: { job: true } }),
              this.prisma.delivery.count({ where: { ...where, ...heldToday } }),
            ])
          : [[], 0];
      const [saved, matching] = await Promise.all([
        this.savedSet(user.id, [...page, ...held].map((d) => d.jobId)),
        cursor ? false : this.stillMatching(user.id, now),
      ]);
      const matchCard = (d: (typeof page)[number]) => card(d.job, matchOf(d, heldFrom), saved.has(d.jobId));
      return {
        items: page.map(matchCard),
        ...(heldCount ? { held: { count: heldCount, items: held.map(matchCard) } } : {}),
        nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
        ...(matching ? { matching } : {}),
        ...(cursor || premiumJobs
          ? {}
          : {
              lockedCount: await this.prisma.delivery.count({
                where: { userId: user.id, status: { in: ["locked", "teased"] }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
              }),
            }),
      };
    }

    const similar = q.similarTo ? await this.similarWhere(q.similarTo) : null;
    const jobs = await this.prisma.job.findMany({
      where: {
        AND: [
          this.jobWhere(q, now, excludeUnpaid),
          ...(similar ? [similar] : []),
          { firstSeenAt: { gte: new Date(now.getTime() - ALL_JOBS_WINDOW_MS) } },
          ...(cursor ? [{ OR: [{ firstSeenAt: { lt: cursor.at } }, { firstSeenAt: cursor.at, id: { lt: cursor.id } }] }] : []),
        ],
      },
      orderBy: [{ firstSeenAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    let page = jobs.slice(0, limit);
    const last = page[page.length - 1]; // before reordering: the cursor follows the sort order
    // First page: NGO/embassy/international jobs only in 2nd and 4th place (at least one when there is one).
    if (!cursor) {
      const extra = page.slice(0, 5).some(isPremiumJob)
        ? []
        : await this.prisma.job.findMany({
            where: { AND: [this.jobWhere(q, now, excludeUnpaid), ...(similar ? [similar] : []), { firstSeenAt: { gte: new Date(now.getTime() - ALL_JOBS_WINDOW_MS) } }, PREMIUM_JOB] },
            orderBy: [{ firstSeenAt: "desc" }, { id: "desc" }],
            take: 1,
          });
      page = balanceTop(page, extra, isPremiumJob, (j) => j.id);
    }
    const ids = page.map((j) => j.id);
    const [delivered, saved] = await Promise.all([this.matchesFor(user.id, ids, heldFrom), this.savedSet(user.id, ids)]);
    return {
      items: page.map((j) => card(j, delivered.get(j.id) ?? null, saved.has(j.id))),
      nextCursor: jobs.length > limit && last ? encodeCursor(last.firstSeenAt, last.id) : null,
    };
  }

  async one(user: User, id: string): Promise<JobCardDto> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job || job.status === "hidden" || job.status === "review") throw new NotFoundException("Job not found");
    const [{ premiumJobs, heldFrom }, maps, delivery, saved] = await Promise.all([
      this.userView(user),
      this.lookupMaps(),
      this.prisma.delivery.findUnique({ where: { userId_jobId: { userId: user.id, jobId: id } }, select: { status: true, error: true, createdAt: true } }),
      this.prisma.savedJob.findUnique({ where: { userId_jobId: { userId: user.id, jobId: id } }, select: { jobId: true } }),
    ]);
    const match = delivery ? matchOf(delivery, heldFrom) : null;
    return toCard(job, { premiumJobs, match, saved: !!saved, heldToday: match === "waiting", ...maps });
  }

  /** Bookmark (idempotent). */
  async save(user: User, id: string): Promise<{ saved: true }> {
    const job = await this.prisma.job.findUnique({ where: { id }, select: { status: true } });
    if (!job || job.status === "hidden" || job.status === "review") throw new NotFoundException("Job not found");
    await this.prisma.savedJob.upsert({ where: { userId_jobId: { userId: user.id, jobId: id } }, create: { userId: user.id, jobId: id }, update: {} });
    return { saved: true };
  }

  async unsave(user: User, id: string): Promise<{ saved: false }> {
    await this.prisma.savedJob.deleteMany({ where: { userId: user.id, jobId: id } });
    return { saved: false };
  }

  /** A photo message for the Mini App's Share (Telegram's chat picker). Premium jobs never name the employer. */
  async prepareShare(user: User, id: string): Promise<{ id: string }> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job || job.status === "hidden" || job.status === "review") throw new NotFoundException("Job not found");
    const kind = employerLabel(job.employerType) ?? (job.isOverseas ? "Abroad" : null);
    const caption = jobShareCaption({
      title: job.title,
      who: isPremiumJob(job) ? kind : (job.company ?? kind),
      location: locationText(job),
      deadline: job.deadline,
    }, `https://t.me/${this.env.TELEGRAM_BOT_USERNAME}`);
    const imageUrl = new URL(`/j/${job.id}/share.jpg`, this.env.WEB_APP_URL).toString();
    return { id: await this.bot.prepareJobShare(user, { jobId: job.id, imageUrl, caption }) };
  }

  /** A shared job link: public teaser, no sign-in. */
  async publicOne(id: string): Promise<PublicJobDto> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job || job.status === "hidden" || job.status === "review") throw new NotFoundException("Job not found");
    return toPublic(job);
  }

  /** The worker hasn't finished matching their latest preferences save (UserPreferences.matchedAt behind updatedAt). */
  private async stillMatching(userId: string, now: Date): Promise<boolean> {
    const p = await this.prisma.userPreferences.findUnique({ where: { userId }, select: { updatedAt: true, matchedAt: true } });
    if (!p || now.getTime() - p.updatedAt.getTime() > MATCHING_MAX_MS) return false;
    return !p.matchedAt || p.matchedAt < p.updatedAt;
  }

  private async matchesFor(userId: string, jobIds: string[], heldFrom: Date | null): Promise<Map<string, JobCardDto["match"]>> {
    if (!jobIds.length) return new Map();
    const rows = await this.prisma.delivery.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true, status: true, error: true, createdAt: true } });
    return new Map(rows.map((d) => [d.jobId, matchOf(d, heldFrom)]));
  }

  private async savedSet(userId: string, jobIds: string[]): Promise<Set<string>> {
    if (!jobIds.length) return new Set();
    const rows = await this.prisma.savedJob.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true } });
    return new Set(rows.map((r) => r.jobId));
  }
}
