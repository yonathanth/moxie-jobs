import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import type { User } from "@ethio/db";
import type { CvContent, CvDetailDto, CvGenerateResponse, CvListDto, CvPolishResponse, CvReviewTip, CvTemplateDto } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CvService } from "./cv.service";

const generateSchema = z
  .object({
    flow: z.enum(["create", "improve", "tailor"]),
    sourceText: z.string().max(25_000).optional(),
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(40).optional(),
    focus: z.string().trim().max(500).optional(),
    jobId: z.uuid().optional(),
    baseCvId: z.uuid().optional(),
    forJobId: z.uuid().optional(),
    templateId: z.string().max(80).optional(),
  })
  .strict();

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    templateId: z.string().min(1).max(80).optional(),
    // Validated by the engine on render; kept loose here (GoMoxie's CVContent shape).
    content: z.record(z.string(), z.unknown()).refine((c) => typeof c.personal === "object", "personal is required").optional(),
  })
  .strict();

const MAX_UPLOAD = 10 * 1024 * 1024;

const contentSchema = z.record(z.string(), z.unknown()).refine((c) => typeof c.personal === "object", "personal is required");
const polishTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("summary") }),
  z.object({ kind: z.literal("bullets"), index: z.number().int().min(0).max(50).optional() }),
  z.object({ kind: z.literal("skills") }),
  z.object({ kind: z.literal("headline") }),
]);
const polishSchema = z.object({ content: contentSchema.optional(), targets: z.union([z.literal("all"), z.array(polishTargetSchema).min(1).max(20)]) }).strict();
const reviewSchema = z.object({ content: contentSchema.optional() }).strict();

@Controller("cv")
@UseGuards(AuthGuard)
export class CvController {
  constructor(private readonly cvs: CvService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<CvListDto> {
    return this.cvs.list(user);
  }

  /** GoMoxie's template gallery. */
  @Get("templates")
  templates(): Promise<CvTemplateDto[]> {
    return this.cvs.templates();
  }

  /** "Improve my CV": an uploaded PDF / Word / photo → its text. */
  @Post("import")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD, files: 1 } }))
  importFile(@UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<{ text: string }> {
    if (!file) throw new BadRequestException("Upload your CV file");
    return this.cvs.importFile(file);
  }

  @Post("generate")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  generate(@CurrentUser() user: User, @Body(new ZodValidationPipe(generateSchema)) body: z.infer<typeof generateSchema>): Promise<CvGenerateResponse> {
    return this.cvs.generate(user, body);
  }

  @Get(":id")
  get(@CurrentUser() user: User, @Param("id", new ParseUUIDPipe()) id: string): Promise<CvDetailDto> {
    return this.cvs.get(user, id);
  }

  @Get(":id/preview")
  async preview(@CurrentUser() user: User, @Param("id", new ParseUUIDPipe()) id: string): Promise<{ html: string }> {
    return { html: await this.cvs.previewHtml(user, id) };
  }

  @Patch(":id")
  update(
    @CurrentUser() user: User,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<CvDetailDto> {
    return this.cvs.update(user, id, { ...body, content: body.content as CvContent | undefined });
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.cvs.remove(user, id);
  }

  /** AI polish (paid plans): the rewritten CV, for the editor to apply. */
  @Post(":id/polish")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  polish(
    @CurrentUser() user: User,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(polishSchema)) body: z.infer<typeof polishSchema>,
  ): Promise<CvPolishResponse> {
    return this.cvs.polish(user, id, { content: body.content as CvContent | undefined, targets: body.targets });
  }

  /** AI check (paid plans): recruiter-style tips. */
  @Post(":id/review")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  async review(
    @CurrentUser() user: User,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(reviewSchema)) body: z.infer<typeof reviewSchema>,
  ): Promise<{ tips: CvReviewTip[] }> {
    return { tips: await this.cvs.review(user, id, body.content as CvContent | undefined) };
  }

  /** Sends the PDF to the person's Telegram chat (watermarked while unpaid). */
  @Post(":id/send")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  send(@CurrentUser() user: User, @Param("id", new ParseUUIDPipe()) id: string): Promise<{ sent: boolean; watermarked: boolean }> {
    return this.cvs.sendPdf(user, id);
  }
}
