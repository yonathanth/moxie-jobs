import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { CvDocument, Prisma, User } from "@ethio/db";
import {
  cvPacks,
  effectivePlan,
  resolveLimits,
  type CvContent,
  type CvDetailDto,
  type CvGenerateRequest,
  type CvGenerateResponse,
  type CvJobRequirements,
  type CvPolishResponse,
  type CvPolishTarget,
  type CvReviewTip,
  type CvListDto,
  type CvQuotaDto,
  type CvSummaryDto,
  type CvTemplateDto,
} from "@ethio/shared";
import { BotService } from "../bot/bot.service";
import { escapeHtml } from "../bot/bot.messages";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { allowanceLeft, cvAsText, cvTitle, decideCharge, jobDescriptionFor, toPlainContent } from "./cv.rules";
import { GomoxieClient } from "./gomoxie.client";

const DAY = 24 * 3_600_000;

export class PaywallException extends HttpException {
  constructor(message: string) {
    super({ statusCode: 402, code: "PAYMENT_REQUIRED", message }, HttpStatus.PAYMENT_REQUIRED);
  }
}

@Injectable()
export class CvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly engine: GomoxieClient,
    private readonly bot: BotService,
  ) {}

  /* ---------- reading ---------- */

  async quota(user: User): Promise<CvQuotaDto> {
    const settings = await this.settings.get();
    const plan = effectivePlan(user, settings);
    const limits = resolveLimits(plan, settings);
    const { used, tasterUsed, unpaidCount } = await this.usage(user.id);
    return {
      plan,
      packs: cvPacks(settings),
      credits: { new: user.cvNewCredits, tailor: user.cvTailorCredits },
      newLeft: allowanceLeft(limits.cvNewPerMonth, used.new),
      tailorLeft: allowanceLeft(limits.cvTailorPerMonth, used.tailor),
      freeTailoringAvailable: !tasterUsed,
      unpaidCount,
      unpaidCap: settings.unpaidCvCap,
    };
  }

  private async usage(userId: string) {
    const since = new Date(Date.now() - 30 * DAY);
    const [planNew, planTailor, taster, unpaidCount] = await Promise.all([
      this.prisma.cvDocument.count({ where: { userId, charge: "plan", flow: { in: ["create", "improve"] }, createdAt: { gte: since } } }),
      this.prisma.cvDocument.count({ where: { userId, charge: "plan", flow: "tailor", createdAt: { gte: since } } }),
      this.prisma.cvDocument.count({ where: { userId, charge: "taster" } }),
      this.prisma.cvDocument.count({ where: { userId, charge: "locked", deletedAt: null } }),
    ]);
    return { used: { new: planNew, tailor: planTailor }, tasterUsed: taster > 0, unpaidCount };
  }

  async list(user: User): Promise<CvListDto> {
    const [docs, quota] = await Promise.all([
      this.prisma.cvDocument.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 100 }),
      this.quota(user),
    ]);
    const jobs = await this.jobTitles(docs.map((d) => d.jobId));
    return { items: docs.map((d) => this.summary(d, jobs)), quota };
  }

  async get(user: User, id: string): Promise<CvDetailDto> {
    const doc = await this.owned(user, id);
    const settings = await this.settings.get();
    return this.detail(doc, user, await this.jobTitles([doc.jobId]), this.canPolish(user, settings));
  }

  /** Unlocks a locked CV with one pack credit of its kind, then sends the clean PDF. */
  async unlockWithCredit(user: User, id: string): Promise<CvDetailDto> {
    const doc = await this.owned(user, id);
    if (doc.charge !== "locked") throw new BadRequestException("This CV is already unlocked");
    const column = doc.lockedProduct === "cv_tailor" ? "cvTailorCredits" : "cvNewCredits";
    const unlocked = await this.prisma.$transaction(async (tx) => {
      const spent = await tx.user.updateMany({ where: { id: user.id, [column]: { gt: 0 } }, data: { [column]: { decrement: 1 } } });
      if (spent.count === 0) return null;
      return tx.cvDocument.update({ where: { id: doc.id }, data: { charge: "credit", lockedProduct: null, unlockedAt: new Date() } });
    });
    if (!unlocked) throw new PaywallException("No CV credits left. Get a CV pack to unlock it.");
    await this.sendPdf(user, doc.id).catch(() => undefined);
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const settings = await this.settings.get();
    return this.detail(unlocked, fresh, await this.jobTitles([unlocked.jobId]), this.canPolish(fresh, settings));
  }

  /** AI polish and AI check come with paid plans (and the beta). */
  private canPolish(user: User, settings: Awaited<ReturnType<SettingsService["get"]>>): boolean {
    return effectivePlan(user, settings) !== "free";
  }

  private requirementsOf(doc: CvDocument): CvJobRequirements | null {
    const a = doc.jobAnalysis as { requirements?: CvJobRequirements | null } | null;
    return a?.requirements ?? null;
  }

  /** AI polish (paid plans). Returns the rewritten CV for the editor to apply; nothing is saved here. */
  async polish(user: User, id: string, body: { content?: CvContent; targets: CvPolishTarget[] | "all" }): Promise<CvPolishResponse> {
    const doc = await this.owned(user, id);
    if (!this.canPolish(user, await this.settings.get())) throw new PaywallException("AI polish comes with Pro and Career.");
    const result = await this.engine.polish(body.content ?? (doc.content as CvContent), doc.templateId, body.targets, this.requirementsOf(doc));
    return { ...result, content: toPlainContent(result.content) };
  }

  /** AI check (paid plans): recruiter-style tips. */
  async review(user: User, id: string, content?: CvContent): Promise<CvReviewTip[]> {
    const doc = await this.owned(user, id);
    if (!this.canPolish(user, await this.settings.get())) throw new PaywallException("AI check comes with Pro and Career.");
    return this.engine.review(content ?? (doc.content as CvContent), doc.templateId, this.requirementsOf(doc));
  }

  async templates(): Promise<CvTemplateDto[]> {
    return this.engine.listTemplates();
  }

  async previewHtml(user: User, id: string): Promise<string> {
    const doc = await this.owned(user, id);
    return this.engine.previewHtml(doc.content as CvContent, doc.templateId);
  }

  /* ---------- making CVs ---------- */

  /** An uploaded CV → its text (for "Improve my CV"). Nothing is stored. */
  async importFile(file: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<{ text: string }> {
    if (!/\.(pdf|docx|png|jpe?g)$/i.test(file.originalname)) throw new BadRequestException("Upload a PDF, Word (.docx) file or a photo");
    const text = await this.engine.importFile(file);
    if (text.trim().length < 40) throw new BadRequestException("We couldn't read much from that file. Try a clearer photo or a PDF.");
    return { text: text.slice(0, 25_000) };
  }

  async generate(user: User, req: CvGenerateRequest): Promise<CvGenerateResponse> {
    const settings = await this.settings.get();
    const limits = resolveLimits(effectivePlan(user, settings), settings);
    const { used, tasterUsed, unpaidCount } = await this.usage(user.id);

    // What the engine works from.
    let sourceText = req.sourceText?.trim() ?? "";
    let jobDescription: string | undefined;
    let job: { id: string; title: string; company: string | null } | null = null;
    let baseCv: CvDocument | null = null;
    if (req.flow === "tailor") {
      if (!req.jobId) throw new BadRequestException("Pick the job to tailor your CV to");
      const found = await this.prisma.job.findUnique({
        where: { id: req.jobId },
        include: { sightings: { where: { isFirst: true }, take: 1, include: { rawPost: { select: { text: true, pageText: true } } } } },
      });
      if (!found) throw new NotFoundException("Job not found");
      job = found;
      baseCv = req.baseCvId
        ? await this.owned(user, req.baseCvId)
        : await this.prisma.cvDocument.findFirst({ where: { userId: user.id, kind: "base", deletedAt: null }, orderBy: { updatedAt: "desc" } });
      if (!baseCv) throw new BadRequestException("Create your CV first, then tailor it");
      sourceText = cvAsText(baseCv.content as CvContent);
      const raw = found.sightings[0]?.rawPost;
      jobDescription = jobDescriptionFor(found, [raw?.text, raw?.pageText].filter(Boolean).join("\n\n") || null);
    } else {
      if (sourceText.length < 40) throw new BadRequestException("Tell us a bit more about your experience (a few sentences at least)");
      if (req.phone) sourceText = `${sourceText}\nPhone: ${req.phone}`;
      if (req.location) sourceText = `${sourceText}\nLocation: ${req.location}`;
    }

    const freeBase = req.flow !== "tailor" && Boolean(req.forJobId) && (await this.prisma.cvDocument.count({ where: { userId: user.id } })) === 0 /* deleted CVs count: one free base CV per person */;
    const decision = decideCharge({
      flow: req.flow,
      freeBase,
      tasterUsed,
      limits,
      usedThisMonth: used,
      credits: { new: user.cvNewCredits, tailor: user.cvTailorCredits },
      unpaidCount,
      unpaidCap: settings.unpaidCvCap,
    });
    if ("blocked" in decision) {
      throw new PaywallException(`You've used your free CVs (${unpaidCount} are waiting to be unlocked).`);
    }

    // Tailoring: read what the job asks for at the same time (the score's job match). Optional.
    const [result, requirements] = await Promise.all([
      this.engine.generate({
        flowType: req.flow,
        sourceText,
        jobDescription,
        templateId: req.templateId ?? baseCv?.templateId,
        name: req.name,
        email: req.email,
        focusInstructions: req.focus,
      }),
      jobDescription ? this.engine.jobRequirements(jobDescription).catch(() => null) : Promise.resolve(null),
    ]);
    if (result.mismatch) return { status: "mismatch", reason: result.reason, missing: result.missing };
    const content = toPlainContent(result.candidateData as Record<string, unknown>);

    const kind = req.flow === "tailor" ? "tailored" : "base";
    // A pack credit is spent only once the CV exists (a failed or mismatched run costs nothing).
    let charge: string = decision.charge;
    let lockedProduct: string | null = decision.charge === "locked" ? decision.product : null;
    if (decision.charge === "credit") {
      const column = req.flow === "tailor" ? "cvTailorCredits" : "cvNewCredits";
      const spent = await this.prisma.user.updateMany({ where: { id: user.id, [column]: { gt: 0 } }, data: { [column]: { decrement: 1 } } });
      if (spent.count === 0) {
        charge = "locked";
        lockedProduct = req.flow === "tailor" ? "cv_tailor" : "cv_new";
      }
    }
    const doc = await this.prisma.cvDocument.create({
      data: {
        userId: user.id,
        title: cvTitle(kind, content, job ?? undefined),
        kind,
        flow: req.flow,
        jobId: job?.id ?? req.forJobId ?? null,
        baseCvId: baseCv?.id ?? null,
        templateId: result.templateId,
        content: content as Prisma.InputJsonValue,
        charge,
        lockedProduct,
        jobAnalysis: (result.jobAnalysis || requirements ? { ...(result.jobAnalysis ?? {}), requirements } : undefined) as Prisma.InputJsonValue | undefined,
        questions: (result.questions ?? []) as Prisma.InputJsonValue,
      },
    });
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { status: "ok", cv: this.detail(doc, fresh, job ? new Map([[job.id, job.title]]) : new Map(), this.canPolish(user, settings)) };
  }

  /* ---------- editing ---------- */

  async update(user: User, id: string, patch: { title?: string; templateId?: string; content?: CvContent }): Promise<CvDetailDto> {
    const doc = await this.owned(user, id);
    if (patch.templateId) {
      const known = await this.engine.listTemplates().catch(() => []);
      if (known.length && !known.some((t) => t.id === patch.templateId)) throw new BadRequestException("Unknown template");
    }
    const updated = await this.prisma.cvDocument.update({
      where: { id: doc.id },
      data: {
        ...(patch.title ? { title: patch.title.slice(0, 120) } : {}),
        ...(patch.templateId ? { templateId: patch.templateId } : {}),
        ...(patch.content ? { content: patch.content as Prisma.InputJsonValue } : {}),
      },
    });
    const settings = await this.settings.get();
    return this.detail(updated, user, await this.jobTitles([updated.jobId]), this.canPolish(user, settings));
  }

  async remove(user: User, id: string): Promise<void> {
    const doc = await this.owned(user, id);
    // Kept as a hidden row so it still counts toward free and plan usage.
    await this.prisma.cvDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  }

  /* ---------- delivery ---------- */

  /** Sends the PDF to the person's Telegram chat (watermarked while unpaid). */
  async sendPdf(user: Pick<User, "id" | "telegramId">, id: string): Promise<{ sent: boolean; watermarked: boolean }> {
    const doc = await this.prisma.cvDocument.findUnique({ where: { id } });
    if (!doc || doc.deletedAt || doc.userId !== user.id) throw new NotFoundException("CV not found");
    const watermarked = doc.charge === "locked";
    const pdf = await this.engine.pdf(doc.content as CvContent, doc.templateId, watermarked);
    const name = ((doc.content as CvContent).personal?.full_name ?? "CV").replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "CV";
    const caption = watermarked
      ? `<b>${escapeHtml(doc.title)}</b>\nPreview copy (watermarked). Unlock it in the app with a CV pack to get the clean PDF.`
      : `<b>${escapeHtml(doc.title)}</b>\nYour CV, ready to send to employers.`;
    const sent = await this.bot.sendDocument(user, pdf, `${name} - CV${watermarked ? " (preview)" : ""}.pdf`, caption);
    return { sent, watermarked };
  }

  /* ---------- helpers ---------- */

  private async owned(user: User, id: string): Promise<CvDocument> {
    const doc = await this.prisma.cvDocument.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) throw new NotFoundException("CV not found");
    if (doc.userId !== user.id) throw new ForbiddenException();
    return doc;
  }

  private async jobTitles(ids: (string | null)[]): Promise<Map<string, string>> {
    const clean = [...new Set(ids.filter((x): x is string => !!x))];
    if (!clean.length) return new Map();
    const jobs = await this.prisma.job.findMany({ where: { id: { in: clean } }, select: { id: true, title: true, company: true } });
    return new Map(jobs.map((j) => [j.id, `${j.title}${j.company ? ` · ${j.company}` : ""}`]));
  }

  private summary(d: CvDocument, jobs: Map<string, string>): CvSummaryDto {
    const locked = d.charge === "locked";
    return {
      id: d.id,
      title: d.title,
      kind: d.kind as CvSummaryDto["kind"],
      flow: d.flow as CvSummaryDto["flow"],
      templateId: d.templateId,
      locked,
      jobId: d.jobId,
      jobTitle: d.jobId ? (jobs.get(d.jobId) ?? null) : null,
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  private detail(d: CvDocument, user: Pick<User, "cvNewCredits" | "cvTailorCredits">, jobs: Map<string, string>, canPolish: boolean): CvDetailDto {
    const analysis = (d.jobAnalysis ?? null) as { gaps?: string[] } | null;
    const questions = Array.isArray(d.questions) ? (d.questions as { id: string; question: string; reason?: string }[]) : [];
    return {
      ...this.summary(d, jobs),
      unlockCredits: d.charge !== "locked" ? 0 : d.lockedProduct === "cv_tailor" ? user.cvTailorCredits : user.cvNewCredits,
      content: d.content as CvContent,
      baseCvId: d.baseCvId,
      gaps: analysis?.gaps ?? [],
      questions: questions.filter((q) => q && typeof q.question === "string").slice(0, 5),
      jobRequirements: this.requirementsOf(d),
      canPolish,
    };
  }
}
