import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { User } from "@ethio/db";
import type { MeDto } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "./users.service";

const updateMeSchema = z.object({ alertsPaused: z.boolean() }).strict();

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: User): Promise<MeDto> {
    return this.users.toMe(user);
  }

  @Patch()
  async update(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateMeSchema)) body: z.infer<typeof updateMeSchema>,
  ): Promise<MeDto> {
    await this.users.setAlertsPaused(user.id, body.alertsPaused);
    return this.users.toMe({ ...user, alertsPaused: body.alertsPaused });
  }
}
