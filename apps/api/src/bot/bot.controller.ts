import { Controller, HttpCode, Inject, NotFoundException, Post, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { webhookCallback } from "grammy";
import { ENV, type Env } from "../config/config.module";
import { BotService } from "./bot.service";

/** Telegram webhook endpoint (BOT_MODE=webhook). Telegram signs requests with the secret token header. */
@Controller("telegram")
@SkipThrottle()
export class BotController {
  // Created only in webhook mode: grammY refuses to long-poll once a webhook handler exists.
  private readonly handle: ((req: Request, res: Response) => Promise<void>) | null;

  constructor(
    @Inject(ENV) env: Env,
    bot: BotService,
  ) {
    this.handle =
      env.BOT_ENABLED && env.BOT_MODE === "webhook"
        ? webhookCallback(bot.bot, "express", {
            secretToken: env.TELEGRAM_WEBHOOK_SECRET,
            onTimeout: "return",
            timeoutMilliseconds: 9_000,
          })
        : null;
  }

  @Post("webhook")
  @HttpCode(200)
  async webhook(@Req() req: Request, @Res() res: Response) {
    if (!this.handle) throw new NotFoundException();
    await this.handle(req, res);
  }
}
