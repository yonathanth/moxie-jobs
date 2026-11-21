import { Body, Controller, ForbiddenException, HttpCode, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import type { AuthResponse } from "@ethio/shared";
import { ENV, type Env } from "../config/config.module";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "../users/users.service";
import { InitDataError, verifyInitData } from "./telegram-init-data";
import { TokenService } from "./token.service";

const telegramLoginSchema = z.object({ initData: z.string().min(1).max(4096) });
const devLoginSchema = z.object({
  telegramId: z.number().int().positive().max(1e12).default(1),
  firstName: z.string().max(64).default("Dev"),
});

@Controller("auth")
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  /** Mini App sign-in: exchanges Telegram-signed initData for an API session. */
  @Post("telegram")
  @HttpCode(200)
  async telegram(
    @Body(new ZodValidationPipe(telegramLoginSchema)) body: z.infer<typeof telegramLoginSchema>,
  ): Promise<AuthResponse> {
    let verified;
    try {
      verified = verifyInitData(body.initData, this.env.TELEGRAM_BOT_TOKEN, this.env.INIT_DATA_MAX_AGE_SECONDS);
    } catch (err) {
      if (err instanceof InitDataError) throw new UnauthorizedException(`Telegram sign-in failed: ${err.message}`);
      throw err;
    }
    const user = await this.users.upsertFromTelegram(verified.user, { startParam: verified.startParam });
    return { ...this.tokens.sign(user.id), me: await this.users.toMe(user) };
  }

  /** Local development only: sign in without Telegram. */
  @Post("dev")
  @HttpCode(200)
  async dev(@Body(new ZodValidationPipe(devLoginSchema)) body: z.infer<typeof devLoginSchema>): Promise<AuthResponse> {
    if (!this.env.ALLOW_DEV_AUTH || this.env.NODE_ENV === "production") throw new ForbiddenException();
    const user = await this.users.upsertFromTelegram({ id: body.telegramId, first_name: body.firstName });
    return { ...this.tokens.sign(user.id), me: await this.users.toMe(user) };
  }
}
