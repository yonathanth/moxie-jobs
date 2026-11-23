import { Body, Controller, Get, Patch, Put, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { User } from "@ethio/db";
import type { MeDto } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "./users.service";

const updateMeSchema = z.object({ alertsPaused: z.boolean() }).strict();

/** Blank optional fields are stored as null. */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const cvContactSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    email: optional(120).refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email"),
    phone: optional(30).refine((v) => !v || /^[+\d][\d\s()-]{5,}$/.test(v), "Enter a valid phone number"),
    location: optional(80),
  })
  .strict();

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

  /** Personal details for CVs (name, email, phone, location). */
  @Put("cv-contact")
  async setCvContact(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(cvContactSchema)) body: z.infer<typeof cvContactSchema>,
  ): Promise<MeDto> {
    return this.users.toMe(await this.users.setCvContact(user.id, body));
  }
}
