import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, User } from "@ethio/db";
import {
  MOMENT_IMAGES,
  cvPromo,
  employerLabel,
  isPremiumJob,
  locationText,
  packsPromo,
  premiumPromo,
  resolveCvPackPrices,
  resolvePrices,
  setupReminderText,
  upgradePromo,
  type BotPhotoMessage,
  type BroadcastAudience,
  type BroadcastRequest,
  type BroadcastResult,
} from "@ethio/shared";
import { BotService } from "../bot/bot.service";
import * as M from "../bot/bot.messages";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

/** Pause between people, on top of grammY's flood-wait retries (~15 messages a second). */
const GAP_MS = 70;

/**
 * Admin → Broadcast: send one of the marketing pictures by hand to a group of
 * people (or a test to yourself). Sending runs in the background; each one is
 * logged in PromoLog so the scheduled rotation counts it.
 */
@Injectable()
export class AdminBroadcastService {
  private readonly logger = new Logger(AdminBroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly bot: BotService,
  ) {}

  /** Who's in the group. Blocked and paused people never are. */
  private audienceWhere(audience: BroadcastAudience, now = new Date()): Prisma.UserWhereInput {
    const paid: Prisma.UserWhereInput = { plan: { in: ["pro", "career"] }, OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }] };
    const base: Prisma.UserWhereInput = { botBlockedAt: null, alertsPaused: false };
    switch (audience) {
      case "not_set_up":
        return { ...base, onboardedAt: null };
      case "everyone":
        return { ...base, onboardedAt: { not: null } };
      case "paid":
        return { ...base, onboardedAt: { not: null }, ...paid };
      case "free":
        return { ...base, onboardedAt: { not: null }, NOT: paid };
      case "no_cv":
        return { ...base, onboardedAt: { not: null }, cvs: { none: {} } };
    }
  }

  count(audience: BroadcastAudience): Promise<number> {
    return this.prisma.user.count({ where: this.audienceWhere(audience) });
  }

  async send(admin: User, req: BroadcastRequest): Promise<BroadcastResult> {
    const message = await this.message(req);
    if (req.test) {
      await this.bot.sendPhoto(admin.telegramId, message.image, this.reply(req, message, admin.firstName));
      return { count: 1 };
    }
    const users = await this.prisma.user.findMany({ where: this.audienceWhere(req.audience), select: { id: true, telegramId: true, firstName: true } });
    const slot = `manual ${new Date().toISOString()}`;
    this.logger.log(`broadcast ${req.kind} → ${req.audience}: ${users.length} people (by ${admin.telegramId})`);
    void this.run(users, req, message, slot);
    return { count: users.length };
  }

  private async run(users: { id: string; telegramId: bigint; firstName: string | null }[], req: BroadcastRequest, message: BotPhotoMessage, slot: string) {
    let sent = 0;
    for (const u of users) {
      try {
        if (await this.bot.sendPhoto(u.telegramId, message.image, this.reply(req, message, u.firstName))) sent++;
        await this.prisma.promoLog.create({ data: { userId: u.id, kind: req.kind, slot, ref: req.jobId ?? null } }).catch(() => undefined);
      } catch (err) {
        this.logger.warn(`broadcast to ${u.telegramId} failed: ${String(err)}`);
      }
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    this.logger.log(`broadcast ${req.kind} → ${req.audience} done: ${sent}/${users.length} sent`);
  }

  /** The setup reminder is personal (their name); the rest are the same for everyone. */
  private reply(req: BroadcastRequest, m: BotPhotoMessage, firstName: string | null): M.Reply {
    return req.kind === "setup" ? this.bot.promoReply({ ...m, caption: setupReminderText(firstName) }) : this.bot.promoReply(m);
  }

  private async message(req: BroadcastRequest): Promise<BotPhotoMessage> {
    const settings = await this.settings.get();
    switch (req.kind) {
      case "upgrade":
        return upgradePromo(resolvePrices(settings).pro.month);
      case "cv":
        return cvPromo();
      case "packs":
        return packsPromo(resolveCvPackPrices(settings));
      case "setup":
        return { image: MOMENT_IMAGES.setup, caption: "", buttons: [[{ text: "Set up my job alerts", path: "/app/onboarding" }]] };
      case "premium": {
        if (!req.jobId) throw new BadRequestException("Pick the job to show");
        const job = await this.prisma.job.findUnique({ where: { id: req.jobId } });
        if (!job || job.status !== "active") throw new NotFoundException("That job isn't open");
        if (!isPremiumJob(job)) throw new BadRequestException("That isn't a premium job (NGO, UN/AU/embassy, international company or abroad)");
        return premiumPromo({
          id: job.id,
          title: job.title,
          kind: employerLabel(job.employerType) ?? (job.isOverseas ? "Abroad" : null),
          location: locationText(job),
          deadline: job.deadline,
        });
      }
    }
  }
}
