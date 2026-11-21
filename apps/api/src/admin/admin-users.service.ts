import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, User } from "@ethio/db";
import {
  CITIES,
  EXPERIENCE_BANDS,
  PLAN_NAME,
  resolveLimits,
  type AdminGrantPlan,
  type AdminUserDetail,
  type AdminUserPlanFilter,
  type AdminUserRow,
  type AdminUsersPage,
  type AdminUserStatusFilter,
} from "@ethio/shared";
import { BotService } from "../bot/bot.service";
import { decodeCursor, encodeCursor } from "../jobs/jobs.mapper";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { TaxonomyService } from "../taxonomy/taxonomy.service";

const DAY = 24 * 3_600_000;
const PAID = ["pro", "career"];

export interface UsersQuery {
  q?: string;
  plan: AdminUserPlanFilter;
  status: AdminUserStatusFilter;
  joined?: "7d" | "30d";
  cursor?: string;
}

/** Filters → Prisma where. Pure (given `now`), unit-tested. */
export function usersWhere(q: UsersQuery, now: Date): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  const activePaid: Prisma.UserWhereInput = { plan: { in: PAID }, OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }] };
  switch (q.plan) {
    case "free":
      and.push({ NOT: activePaid });
      break;
    case "pro":
    case "career":
      and.push({ plan: q.plan, OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }] });
      break;
    case "expired":
      and.push({ plan: { in: PAID }, planExpiresAt: { lte: now } });
      break;
  }
  switch (q.status) {
    case "set_up":
      and.push({ onboardedAt: { not: null } });
      break;
    case "not_set_up":
      and.push({ onboardedAt: null });
      break;
    case "paused":
      and.push({ alertsPaused: true });
      break;
    case "blocked":
      and.push({ botBlockedAt: { not: null } });
      break;
  }
  if (q.joined) and.push({ createdAt: { gte: new Date(now.getTime() - (q.joined === "7d" ? 7 : 30) * DAY) } });
  const text = q.q?.trim();
  if (text) {
    const or: Prisma.UserWhereInput[] = [
      { firstName: { contains: text, mode: "insensitive" } },
      { lastName: { contains: text, mode: "insensitive" } },
      { username: { contains: text.replace(/^@/, ""), mode: "insensitive" } },
    ];
    if (/^\d{5,15}$/.test(text)) or.push({ telegramId: BigInt(text) });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

/** How an admin is shown in a user's history ("Yonathan (@yoni)"). */
export function adminLabel(a: Pick<User, "firstName" | "username" | "telegramId">): string {
  const name = a.firstName ?? `Telegram ${a.telegramId.toString()}`;
  return a.username ? `${name} (@${a.username})` : name;
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: TaxonomyService,
    private readonly settings: SettingsService,
    private readonly bot: BotService,
  ) {}

  private row(u: User, alerts7d: number, now: Date): AdminUserRow {
    const paid = PAID.includes(u.plan);
    const active = paid && (!u.planExpiresAt || u.planExpiresAt > now);
    return {
      id: u.id,
      telegramId: u.telegramId.toString(),
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "No name",
      username: u.username,
      plan: active ? (u.plan as "pro" | "career") : "free",
      planExpiresAt: active ? (u.planExpiresAt?.toISOString() ?? null) : null,
      expired: paid && !active,
      onboarded: u.onboardedAt !== null,
      alertsPaused: u.alertsPaused,
      blocked: u.botBlockedAt !== null,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      alerts7d,
    };
  }

  async list(q: UsersQuery): Promise<AdminUsersPage> {
    const now = new Date();
    const limit = 25;
    const where = usersWhere(q, now);
    const c = decodeCursor(q.cursor);
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { AND: [where, ...(c ? [{ OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] }] : [])] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      }),
      this.prisma.user.count({ where }),
    ]);
    const page = users.slice(0, limit);
    const alerts = await this.prisma.delivery.groupBy({
      by: ["userId"],
      where: { userId: { in: page.map((u) => u.id) }, status: "sent", sentAt: { gte: new Date(now.getTime() - 7 * DAY) } },
      _count: true,
    });
    const alertMap = new Map(alerts.map((a) => [a.userId, a._count]));
    const last = page[page.length - 1];
    return {
      items: page.map((u) => this.row(u, alertMap.get(u.id) ?? 0, now)),
      nextCursor: users.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
      total,
    };
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const now = new Date();
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: { preferences: true, professions: { orderBy: { sortOrder: "asc" } }, functions: true, payments: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!u) throw new NotFoundException("User not found");
    const [alertsTotal, clicksTotal, lockedTotal, alerts7d, t] = await Promise.all([
      this.prisma.delivery.count({ where: { userId: id, status: "sent" } }),
      this.prisma.delivery.count({ where: { userId: id, clickedAt: { not: null } } }),
      this.prisma.delivery.count({ where: { userId: id, status: { in: ["locked", "teased"] } } }),
      this.prisma.delivery.count({ where: { userId: id, status: "sent", sentAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
      this.taxonomy.get(),
    ]);
    const professionName = new Map(t.functions.flatMap((f) => f.professions).map((p) => [p.id, p.name]));
    const functionName = new Map(t.functions.map((f) => [f.id, f.name]));
    const fieldName = new Map(t.fieldsOfStudy.map((f) => [f.id, f.name]));
    const cityName = new Map(CITIES.map((c) => [c.id, c.name]));
    const p = u.preferences;
    const salary =
      p && (p.salaryMin || p.salaryMax)
        ? [p.salaryMin?.toLocaleString("en-US"), p.salaryMax?.toLocaleString("en-US")].map((x) => x ?? "any").join("–") + " Br/month"
        : null;
    return {
      ...this.row(u, alerts7d, now),
      startParam: u.startParam,
      preferences: p
        ? {
            professions: u.professions.map((x) => professionName.get(x.professionId) ?? x.professionId),
            categories: u.functions.map((x) => functionName.get(x.functionId) ?? x.functionId),
            degrees: p.fieldOfStudyIds.map((x) => fieldName.get(x) ?? x),
            cities: p.locationIds.map((x) => cityName.get(x) ?? x),
            experience: EXPERIENCE_BANDS.find((b) => b.id === p.experienceBand)?.label ?? null,
            salary,
          }
        : null,
      stats: { alertsTotal, clicksTotal, lockedTotal },
      payments: u.payments.map((x) => ({
        id: x.id,
        plan: x.plan,
        period: x.period,
        amount: x.amount,
        status: x.status,
        createdAt: x.createdAt.toISOString(),
        paidAt: x.paidAt?.toISOString() ?? null,
        byAdmin: x.provider === "admin" ? (x.paymentVia ?? "an admin") : null,
      })),
    };
  }

  /**
   * Gives, extends or removes a plan by hand (support, compensation, partners).
   * Same plan still active → days are added to its end; otherwise it starts now.
   * The user gets the usual "plan is active" message and their locked matches are unlocked.
   */
  async grant(id: string, body: AdminGrantPlan, admin: User): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("User not found");
    const now = new Date();
    const by = adminLabel(admin);
    if (body.plan === "free") {
      const had = PAID.includes(u.plan) && (!u.planExpiresAt || u.planExpiresAt > now) ? u.plan : null;
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id }, data: { plan: "free", planExpiresAt: null } }),
        // History: who removed what, when. Amount 0 and status "removed": never counted as revenue.
        ...(had
          ? [this.prisma.payment.create({ data: { userId: id, plan: had, period: "removed", amount: 0, status: "removed", provider: "admin", paymentVia: by, periodEnd: now } })]
          : []),
      ]);
      return this.detail(id);
    }
    if (!body.days || body.days < 1 || body.days > 366) throw new BadRequestException("Give between 1 and 366 days");
    const active = u.plan === body.plan && u.planExpiresAt !== null && u.planExpiresAt > now;
    const start = active ? u.planExpiresAt! : now;
    const end = new Date(start.getTime() + body.days * DAY);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { plan: body.plan, planExpiresAt: end } }),
      // History: a zero-amount "granted" entry (never counted as revenue).
      this.prisma.payment.create({
        data: { userId: id, plan: body.plan, period: `${body.days} days`, amount: 0, status: "granted", provider: "admin", paymentVia: by, periodStart: start, periodEnd: end, paidAt: now },
      }),
      // Touching preferences makes the worker's backfill unlock their held premium matches.
      this.prisma.userPreferences.updateMany({ where: { userId: id }, data: { updatedAt: now } }),
    ]);
    const limits = resolveLimits(body.plan, await this.settings.get());
    await this.bot.sendPlanActivated(u, PLAN_NAME[body.plan], end, limits).catch(() => undefined);
    return this.detail(id);
  }
}
