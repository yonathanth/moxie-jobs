import { Body, Controller, Get, Logger, Put, UseGuards } from "@nestjs/common";
import type { User } from "@ethio/db";
import { preferencesInputSchema, type Preferences, type PreferencesDto } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { BotService } from "../bot/bot.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PreferencesService } from "./preferences.service";

@Controller("me/preferences")
@UseGuards(AuthGuard)
export class PreferencesController {
  private readonly logger = new Logger(PreferencesController.name);

  constructor(
    private readonly preferences: PreferencesService,
    private readonly bot: BotService,
  ) {}

  @Get()
  get(@CurrentUser() user: User): Promise<PreferencesDto | null> {
    return this.preferences.get(user.id);
  }

  @Put()
  async save(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(preferencesInputSchema)) body: Preferences,
  ): Promise<PreferencesDto> {
    const { prefs, firstTime } = await this.preferences.save(user, body);
    // Confirmation in the chat is best-effort: never fail the save because of it.
    this.bot.sendPreferencesSaved(user, firstTime).catch((err: unknown) => {
      this.logger.warn(`Could not send preferences confirmation: ${String(err)}`);
    });
    return prefs;
  }
}
