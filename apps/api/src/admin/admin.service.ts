import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@ethio/db";
import {
  employerLabel,
  locationText,
  PLANS,
  resolveCvPrices,
  resolveLimits,
  resolvePrices,
  type AdminOverviewDto,
  type AdminSettingsDto,
  type AdminSourceDto,
  type ReviewPage,
} from "@ethio/shared";
import { decodeCursor, encodeCursor } from "../jobs/jobs.mapper";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { TaxonomyService } from "../taxonomy/taxonomy.service";
import { reviewReasons, sourceIdFromHandle, type SettingsUpdate } from "./admin.rules";

const DAY = 24 * 3_600_000;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  async overview(): Promise<AdminOverviewDto> {
    const now = new Date();
    const eat = new Date(now.getTime() + 3 * 3_600_000);
    const dayStart = new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - 3 * 3_600_000);
    const [total, onboarded, paid, newThisWeek, active, review, newToday, alertsToday, sourcesActive, joinPending, revenue, settings] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { onboardedAt: { not: null } } }),
        this.prisma.user.count({ where: { plan: { in: ["pro", "career"] }, planExpiresAt: { gt: now } } }),
        this.prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
        this.prisma.job.count({ where: { status: "active" } }),
        this.prisma.job.count({ where: { status: "review" } }),
        this.prisma.job.count({ where: { firstSeenAt: { gte: dayStart } } }),
        this.prisma.delivery.count({ where: { status: "sent", sentAt: { gte: dayStart } } }),
        this.prisma.source.count({ where: { isActive: true, OR: [{ tgChannelId: { not: null } }, { kind: "website" }] } }),
        this.prisma.source.count({ where: { isActive: true, kind: "telegram", tgChannelId: null, handle: { not: null } } }),
        this.prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "paid", paidAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
        this.settings.get(),
      ]);
    return {
      users: { total, onboarded, paid, newThisWeek },
      jobs: { active, review, newToday },
      alertsToday,
      sources: { active: sourcesActive, joinPending },
      revenue30d: revenue._sum.amount ?? 0,
      beta: settings.betaAllPro,
    };
  }

  /* ---------- Review queue ---------- */

  async reviewQueue(cursor?: string): Promise<ReviewPage> {
    const c = decodeCursor(cursor);
    const limit = 20;
    const where: Prisma.JobWhereInput = { status: "review" };
    const [jobs, total, sources] = await Promise.all([
      this.prisma.job.findMany({
        where: { ...where, ...(c ? { OR: [{ firstSeenAt: { lt: c.at } }, { firstSeenAt: c.at, id: { lt: c.id } }] } : {}) },
        orderBy: [{ firstSeenAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: { sightings: { where: { isFirst: true }, take: 1, include: { rawPost: { select: { text: true, pageText: true } } } } },
      }),
      this.prisma.job.count({ where }),
      this.prisma.source.findMany({ select: { id: true, title: true } }),
    ]);
    const sourceTitle = new Map(sources.map((s) => [s.id, s.title]));
    const page = jobs.slice(0, limit);
    const last = page[page.length - 1];
    return {
      total,
      nextCursor: jobs.length > limit && last ? encodeCursor(last.firstSeenAt, last.id) : null,
      items: page.map((j) => {
        const raw = j.sightings[0]?.rawPost;
        const text = [raw?.text, raw?.pageText].filter(Boolean).join("\n\n");
        return {
          id: j.id,
          title: j.title,
          company: j.company,
          employerLabel: employerLabel(j.employerType),
          reasons: reviewReasons(j),
          unclassified: !j.professionId && !j.functionId,
          firstSeenAt: j.firstSeenAt.toISOString(),
          summary: j.summary,
          location: locationText(j),
          deadline: j.deadline?.toISOString() ?? null,
          sourceTitle: sourceTitle.get(j.primarySourceId) ?? null,
          sourceUrl: /^https?:\/\//i.test(j.sourceUrl) ? j.sourceUrl : null,
          postText: text ? text.slice(0, 3000) : null,
        };
      }),
    };
  }

  /**
   * Approves a held job: it becomes active (feed, search) and is flagged
   * "reviewed", which the worker picks up to alert matching users if the job
   * is still within the alert window.
   */
  async approve(id: string, body: { professionId?: string; functionId?: string }): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job || job.status !== "review") throw new NotFoundException("Job not in the review queue");
    const t = await this.taxonomy.get();
    const professions = new Map(t.functions.flatMap((f) => f.professions.map((p) => [p.id, f.id] as const)));
    const functions = new Set(t.functions.map((f) => f.id));
    const data: Prisma.JobUpdateInput = { status: "active", qualityFlags: [...new Set([...job.qualityFlags, "reviewed"])] };
    if (body.professionId) {
      const fn = professions.get(body.professionId);
      if (!fn) throw new BadRequestException("Unknown profession");
      Object.assign(data, { professionId: body.professionId, functionId: fn });
    } else if (body.functionId) {
      if (!functions.has(body.functionId)) throw new BadRequestException("Unknown category");
      data.functionId = body.functionId;
    }
    if (!job.professionId && !job.functionId && !body.professionId && !body.functionId) {
      throw new BadRequestException("Pick a category or profession first, so the job can reach the right people");
    }
    await this.prisma.job.update({ where: { id }, data });
  }

  async reject(id: string): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id }, select: { status: true, qualityFlags: true } });
    if (!job || job.status !== "review") throw new NotFoundException("Job not in the review queue");
    await this.prisma.job.update({ where: { id }, data: { status: "hidden", qualityFlags: [...new Set([...job.qualityFlags, "rejected"])] } });
  }

  /* ---------- Settings: prices, limits, beta, delivery, unpaid ---------- */

  async getSettings(): Promise<AdminSettingsDto> {
    const s = await this.settings.get();
    return {
      betaAllPro: s.betaAllPro,
      unpaidJobs: s.unpaidJobs,
      delivery: s.delivery,
      prices: resolvePrices(s),
      planLimits: Object.fromEntries(PLANS.map((p) => [p, resolveLimits(p, s)])) as AdminSettingsDto["planLimits"],
      cvPrices: resolveCvPrices(s),
      unpaidCvCap: s.unpaidCvCap,
    };
  }

  /** Writes each given key as its own Setting row (full values, so what you see is what's stored). */
  async updateSettings(update: SettingsUpdate): Promise<AdminSettingsDto> {
    const entries = Object.entries(update).filter(([, v]) => v !== undefined);
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue },
          update: { value: value as Prisma.InputJsonValue },
        }),
      ),
    );
    this.settings.invalidate();
    return this.getSettings();
  }

  /* ---------- Sources ---------- */

  async sources(): Promise<AdminSourceDto[]> {
    const since = new Date(Date.now() - 7 * DAY);
    const [sources, posts, jobs, last] = await Promise.all([
      this.prisma.source.findMany({ orderBy: [{ tier: "asc" }, { linkPriority: "desc" }, { title: "asc" }] }),
      this.prisma.rawPost.groupBy({ by: ["sourceId"], where: { createdAt: { gte: since } }, _count: true }),
      this.prisma.job.groupBy({ by: ["primarySourceId"], where: { firstSeenAt: { gte: since } }, _count: true }),
      this.prisma.rawPost.groupBy({ by: ["sourceId"], _max: { postedAt: true } }),
    ]);
    const postCount = new Map(posts.map((p) => [p.sourceId, p._count]));
    const jobCount = new Map(jobs.map((j) => [j.primarySourceId, j._count]));
    const lastPost = new Map(last.map((l) => [l.sourceId, l._max.postedAt]));
    return sources.map((s) => ({
      id: s.id,
      title: s.title,
      handle: s.handle,
      kind: s.kind,
      type: s.type,
      tier: s.tier,
      isActive: s.isActive,
      joined: s.kind === "website" || s.tgChannelId !== null,
      joinPending: s.kind === "telegram" && s.isActive && s.tgChannelId === null && s.handle !== null,
      trust: s.trust,
      linkPriority: s.linkPriority,
      posts7d: postCount.get(s.id) ?? 0,
      jobs7d: jobCount.get(s.id) ?? 0,
      lastPostAt: lastPost.get(s.id)?.toISOString() ?? null,
      notes: s.notes,
    }));
  }

  async updateSource(id: string, patch: { isActive?: boolean; trust?: number; linkPriority?: number; title?: string }): Promise<void> {
    const exists = await this.prisma.source.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Source not found");
    await this.prisma.source.update({ where: { id }, data: patch });
  }

  /** Adds a Telegram channel; the worker joins it (one at a time, spaced out) and starts listening. */
  async addSource(input: { handle: string; title?: string }): Promise<void> {
    const handle = input.handle.replace(/^@/, "");
    const id = sourceIdFromHandle(handle);
    const clash = await this.prisma.source.findFirst({ where: { OR: [{ id }, { handle: { equals: handle, mode: "insensitive" } }] } });
    if (clash) {
      if (clash.isActive) throw new ConflictException(`@${handle} is already a source`);
      // Known but inactive (e.g. a tier-2 seed entry): just switch it on.
      await this.prisma.source.update({ where: { id: clash.id }, data: { isActive: true, handle: clash.handle ?? handle } });
      return;
    }
    await this.prisma.source.create({
      data: { id, handle, title: input.title?.trim() || `@${handle}`, kind: "telegram", type: "repost", format: "mixed", tier: 2, trust: 0.6, linkPriority: 40, isActive: true },
    });
  }
}
