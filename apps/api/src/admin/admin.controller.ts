import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  ADMIN_USER_PLAN_FILTERS,
  ADMIN_USER_STATUS_FILTERS,
  PLANS,
  type AdminOverviewDto,
  type AdminSettingsDto,
  type AdminSourceDto,
  type AdminUserDetail,
  type AdminUsersPage,
  type ReviewPage,
} from "@ethio/shared";
import type { User } from "@ethio/db";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminGuard } from "./admin.guard";
import { approveSchema, settingsUpdateSchema, sourceCreateSchema, sourcePatchSchema } from "./admin.rules";
import { AdminUsersService } from "./admin-users.service";
import { AdminService } from "./admin.service";

const usersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  plan: z.enum(ADMIN_USER_PLAN_FILTERS).default("all"),
  status: z.enum(ADMIN_USER_STATUS_FILTERS).default("all"),
  joined: z.enum(["7d", "30d"]).optional(),
  cursor: z.string().max(200).optional(),
});
const grantSchema = z.object({ plan: z.enum(PLANS), days: z.number().int().min(1).max(366).optional() }).strict();

/** Admin tools (Mini App → Admin). Only Telegram IDs in ADMIN_TELEGRAM_IDS. */
@Controller("admin")
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly users: AdminUsersService,
  ) {}

  @Get("users")
  listUsers(@Query(new ZodValidationPipe(usersQuerySchema)) q: z.infer<typeof usersQuerySchema>): Promise<AdminUsersPage> {
    return this.users.list(q);
  }

  @Get("users/:id")
  user(@Param("id", new ParseUUIDPipe()) id: string): Promise<AdminUserDetail> {
    return this.users.detail(id);
  }

  @Post("users/:id/plan")
  grant(
    @CurrentUser() admin: User,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(grantSchema)) body: z.infer<typeof grantSchema>,
  ): Promise<AdminUserDetail> {
    return this.users.grant(id, body, admin);
  }

  @Get("overview")
  overview(): Promise<AdminOverviewDto> {
    return this.admin.overview();
  }

  @Get("review")
  review(@Query("cursor") cursor?: string): Promise<ReviewPage> {
    return this.admin.reviewQueue(cursor?.slice(0, 200));
  }

  @Post("review/:id/approve")
  @HttpCode(204)
  approve(@Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(approveSchema)) body: z.infer<typeof approveSchema>) {
    return this.admin.approve(id, body);
  }

  @Post("review/:id/reject")
  @HttpCode(204)
  reject(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.admin.reject(id);
  }

  @Get("settings")
  settings(): Promise<AdminSettingsDto> {
    return this.admin.getSettings();
  }

  @Put("settings")
  updateSettings(@Body(new ZodValidationPipe(settingsUpdateSchema)) body: z.infer<typeof settingsUpdateSchema>): Promise<AdminSettingsDto> {
    return this.admin.updateSettings(body);
  }

  @Get("sources")
  sources(): Promise<AdminSourceDto[]> {
    return this.admin.sources();
  }

  @Patch("sources/:id")
  @HttpCode(204)
  updateSource(@Param("id") id: string, @Body(new ZodValidationPipe(sourcePatchSchema)) body: z.infer<typeof sourcePatchSchema>) {
    return this.admin.updateSource(id.slice(0, 80), body);
  }

  @Post("sources")
  @HttpCode(204)
  addSource(@Body(new ZodValidationPipe(sourceCreateSchema)) body: z.infer<typeof sourceCreateSchema>) {
    return this.admin.addSource(body);
  }
}
