import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { User } from "@ethio/db";
import { SHARE_APP_KINDS } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { BotService } from "../bot/bot.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

const shareAppSchema = z.object({ kind: z.enum(SHARE_APP_KINDS) }).strict();

/** "Share Meklit Jobs" (Profile): prepares the chosen picture message for WebApp.shareMessage. */
@Controller("share")
@UseGuards(AuthGuard)
export class ShareController {
  constructor(private readonly bot: BotService) {}

  @Post("app")
  @HttpCode(200)
  async app(@CurrentUser() user: User, @Body(new ZodValidationPipe(shareAppSchema)) body: z.infer<typeof shareAppSchema>): Promise<{ id: string }> {
    return { id: await this.bot.prepareAppShare(user, body.kind) };
  }
}
