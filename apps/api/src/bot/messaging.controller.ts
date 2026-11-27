import { Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { User } from "@ethio/db";
import type { MessagingStatusDto } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { BotService } from "./bot.service";

/**
 * Can the bot message this person? People who open the Mini App from a link never pressed Start, and
 * every alert to them fails ("chat not found") until they allow messages. The Mini App asks before letting
 * them in, and tells us when they allow it so the jobs held back so far get sent.
 */
@Controller("me/messaging")
@UseGuards(AuthGuard)
export class MessagingController {
  constructor(private readonly bot: BotService) {}

  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async status(@CurrentUser() user: User): Promise<MessagingStatusDto> {
    return { canMessage: await this.bot.canMessage(user.telegramId) };
  }

  /** They just allowed messages in Telegram: send what was held back. */
  @Post("allowed")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async allowed(@CurrentUser() user: User): Promise<MessagingStatusDto> {
    const canMessage = await this.bot.canMessage(user.telegramId);
    if (canMessage !== false) await this.bot.messagesAllowed(user.id);
    return { canMessage };
  }
}
