import { Inject, Injectable } from "@nestjs/common";
import type { User } from "@ethio/db";
import type { CvContact, MeDto, MeStats } from "@ethio/shared";
import { ENV, type Env } from "../config/config.module";
import { PrismaService } from "../prisma/prisma.service";
import { effectivePlan, resolveLimits } from "../settings/plan";
import { SettingsService } from "../settings/settings.service";

/** The Telegram user fields we keep (from initData or a bot update). */
export interface TelegramIdentity {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Creates the user on first contact, refreshes their Telegram profile afterwards. */
  async upsertFromTelegram(tg: TelegramIdentity, opts: { startParam?: string } = {}): Promise<User> {
    const profile = {
      firstName: tg.first_name ?? null,
      lastName: tg.last_name ?? null,
      username: tg.username ?? null,
      languageCode: tg.language_code ?? null,
      isPremiumTg: tg.is_premium ?? false,
    };
    return this.prisma.user.upsert({
      where: { telegramId: BigInt(tg.id) },
      // startParam is first-touch attribution: only set on create.
      create: { telegramId: BigInt(tg.id), ...profile, startParam: opts.startParam?.slice(0, 64) ?? null, lastSeenAt: new Date() },
      update: { ...profile, lastSeenAt: new Date(), botBlockedAt: null },
    });
  }

  findByTelegramId(telegramId: number | bigint) {
    return this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  }

  async setAlertsPaused(userId: string, paused: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { alertsPaused: paused } });
  }

  async markBotBlocked(telegramId: number | bigint, blocked: boolean) {
    await this.prisma.user.updateMany({
      where: { telegramId: BigInt(telegramId) },
      data: { botBlockedAt: blocked ? new Date() : null },
    });
  }

  isAdmin(user: Pick<User, "telegramId">): boolean {
    return this.env.ADMIN_TELEGRAM_IDS.includes(user.telegramId.toString());
  }

  async toMe(user: User): Promise<MeDto> {
    const settings = await this.settings.get();
    const now = new Date();
    const plan = effectivePlan(user, settings, now);
    const paid = (user.plan === "pro" || user.plan === "career") && (!user.planExpiresAt || user.planExpiresAt > now);
    return {
      id: user.id,
      telegramId: user.telegramId.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      plan: paid ? (user.plan as "pro" | "career") : "free",
      planExpiresAt: paid ? (user.planExpiresAt?.toISOString() ?? null) : null,
      effectivePlan: plan,
      beta: settings.betaAllPro,
      limits: resolveLimits(plan, settings),
      alertsPaused: user.alertsPaused,
      onboarded: user.onboardedAt !== null,
      isAdmin: this.isAdmin(user),
      stats: await this.stats(user.id, now),
      cvContact: (user.cvContact as CvContact | null) ?? null,
    };
  }

  async setCvContact(userId: string, contact: CvContact): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { cvContact: { ...contact } } });
  }

  private async stats(userId: string, now: Date): Promise<MeStats> {
    // Addis Ababa day (UTC+3).
    const eat = new Date(now.getTime() + 3 * 3_600_000);
    const dayStart = new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - 3 * 3_600_000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);
    const [sentToday, sentThisWeek, lockedThisWeek] = await Promise.all([
      this.prisma.delivery.count({ where: { userId, status: "sent", sentAt: { gte: dayStart } } }),
      this.prisma.delivery.count({ where: { userId, status: "sent", sentAt: { gte: weekAgo } } }),
      this.prisma.delivery.count({ where: { userId, status: { in: ["locked", "teased"] }, createdAt: { gte: weekAgo } } }),
    ]);
    return { sentToday, sentThisWeek, lockedThisWeek };
  }
}
