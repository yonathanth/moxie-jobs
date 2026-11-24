import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Job, Prisma, User } from "@ethio/db";
import { effectivePlan, employerLabel, isPremiumJob, locationText, resolveLimits, type JobCardDto, type JobFeedPage, type JobFeedQuery, type PostedWithin, type PublicJobDto } from "@ethio/shared";
import { BotService } from "../bot/bot.service";
import { jobShareCaption } from "../bot/bot.messages";
import { ENV, type Env } from "../config/config.module";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { decodeCursor, employerTypes, encodeCursor, pinAt, searchTerms, toCard, toPublic } from "./jobs.mapper";

const DAY = 24 * 3_600_000;
const POSTED_MS: Record<PostedWithin, number> = { "1d": DAY, "3d": 3 * DAY, "7d": 7 * DAY, "30d": 30 * DAY };
/** "All jobs" never reaches further back than this, whatever the filters. */
const ALL_JOBS_WINDOW_MS = 30 * DAY;
/** Deliveries shown in "For you": sent alerts, ones held by the daily limit, and locked premium matches. */
const FOR_YOU: Prisma.DeliveryWhereInput = {
  OR: [{ status: { in: ["sent", "locked", "teased"] } }, { status: "skipped", error: "daily_cap" }],
};
const LOOKUP_TTL_MS = 10 * 60_000;

function matchOf(status: string, error: string | null): JobCardDto["match"] {
  if (status === "sent") return "sent";
  if (status === "locked" || status === "teased") return "locked";
  if (status === "skipped" && error === "daily_cap") return "waiting";
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

  private async userView(user: User): Promise<{ premiumJobs: boolean; excludeUnpaid: boolean }> {
    const settings = await this.settings.get();
    return { premiumJobs: resolveLimits(effectivePlan(user, settings), settings).premiumJobs, excludeUnpaid: settings.unpaidJobs === "exclude" };
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
    const [{ premiumJobs, excludeUnpaid }, maps] = await Promise.all([this.userView(user), this.lookupMaps()]);
    const card = (job: Job, match: JobCardDto["match"], saved: boolean) => toCard(job, { premiumJobs, match, saved, ...maps });

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
      const matches = await this.matchesFor(user.id, page.map((r) => r.jobId));
      const last = rows[limit - 1];
      return {
        items: page.map((r) => card(r.job, matches.get(r.jobId) ?? null, true)),
        nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.jobId) : null,
      };
    }

    if (q.scope === "for_you") {
      const rows = await this.prisma.delivery.findMany({
        where: {
          userId: user.id,
          job: this.jobWhere(q, now, excludeUnpaid),
          AND: [FOR_YOU, ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }] : [])],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: { job: true },
      });
      let page = rows.slice(0, limit);
      const last = rows[limit - 1];
      // Plans without premium jobs: show what they're missing near the top (1st and 3rd), first page only.
      if (!cursor && !premiumJobs) {
        const locked = await this.prisma.delivery.findMany({
          where: { userId: user.id, status: { in: ["locked", "teased"] }, job: this.jobWhere(q, now, excludeUnpaid) },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 2,
          include: { job: true },
        });
        page = pinAt(page, locked, [0, 2], (d) => d.id);
      }
      const saved = await this.savedSet(user.id, page.map((d) => d.jobId));
      return {
        items: page.map((d) => card(d.job, matchOf(d.status, d.error), saved.has(d.jobId))),
        nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
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
    const page = jobs.slice(0, limit);
    const ids = page.map((j) => j.id);
    const [delivered, saved] = await Promise.all([this.matchesFor(user.id, ids), this.savedSet(user.id, ids)]);
    const last = page[page.length - 1];
    return {
      items: page.map((j) => card(j, delivered.get(j.id) ?? null, saved.has(j.id))),
      nextCursor: jobs.length > limit && last ? encodeCursor(last.firstSeenAt, last.id) : null,
    };
  }

  async one(user: User, id: string): Promise<JobCardDto> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job || job.status === "hidden" || job.status === "review") throw new NotFoundException("Job not found");
    const [{ premiumJobs }, maps, delivery, saved] = await Promise.all([
      this.userView(user),
      this.lookupMaps(),
      this.prisma.delivery.findUnique({ where: { userId_jobId: { userId: user.id, jobId: id } }, select: { status: true, error: true } }),
      this.prisma.savedJob.findUnique({ where: { userId_jobId: { userId: user.id, jobId: id } }, select: { jobId: true } }),
    ]);
    return toCard(job, { premiumJobs, match: delivery ? matchOf(delivery.status, delivery.error) : null, saved: !!saved, ...maps });
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

  private async matchesFor(userId: string, jobIds: string[]): Promise<Map<string, JobCardDto["match"]>> {
    if (!jobIds.length) return new Map();
    const rows = await this.prisma.delivery.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true, status: true, error: true } });
    return new Map(rows.map((d) => [d.jobId, matchOf(d.status, d.error)]));
  }

  private async savedSet(userId: string, jobIds: string[]): Promise<Set<string>> {
    if (!jobIds.length) return new Set();
    const rows = await this.prisma.savedJob.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true } });
    return new Set(rows.map((r) => r.jobId));
  }
}
