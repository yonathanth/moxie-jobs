import { BadGatewayException, Inject, Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import type { CvContent, CvJobRequirements, CvPolishResponse, CvPolishTarget, CvReviewTip, CvTemplateDto } from "@ethio/shared";
import { ENV, type Env } from "../config/config.module";

/**
 * GoMoxie's CV engine, called as a partner (routes/partner.routes.ts in
 * resume-back): stateless generate / import / preview / PDF. Ethio Jobs owns
 * users, saved CVs and billing; GoMoxie never sees who the person is beyond
 * what's in the CV.
 */

export interface EngineGenerateInput {
  flowType: "create" | "improve" | "tailor";
  sourceText: string;
  jobDescription?: string;
  templateId?: string;
  name?: string;
  email?: string;
  focusInstructions?: string;
}

export type EngineGenerateResult =
  | { mismatch: false; candidateData: CvContent; questions?: { id: string; question: string; reason?: string }[]; jobAnalysis?: { gaps?: string[] } | null; templateId: string }
  | { mismatch: true; reason: string; missing: string[] };

const GENERATE_TIMEOUT_MS = 90_000;
const RENDER_TIMEOUT_MS = 45_000;
const TEMPLATES_TTL_MS = 30 * 60_000;

@Injectable()
export class GomoxieClient {
  private readonly logger = new Logger(GomoxieClient.name);
  private templates: { at: number; list: CvTemplateDto[] } | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled(): boolean {
    return Boolean(this.env.GOMOXIE_API_URL && this.env.GOMOXIE_PARTNER_KEY);
  }

  private url(path: string): string {
    if (!this.enabled) throw new ServiceUnavailableException("CVs aren't available right now");
    return new URL(path, this.env.GOMOXIE_API_URL).toString();
  }

  private async call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.url(path), {
        ...init,
        headers: { ...(init.headers ?? {}), "x-partner-key": this.env.GOMOXIE_PARTNER_KEY! },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      this.logger.error(`GoMoxie ${path} unreachable: ${String(err)}`);
      throw new BadGatewayException("The CV service is busy. Please try again in a moment.");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      const message = body?.error?.message ?? `CV service error (${res.status})`;
      this.logger.warn(`GoMoxie ${path} ${res.status}: ${message}`);
      if (res.status === 422 || res.status === 400) throw new UnprocessableEntityException(message);
      throw new BadGatewayException(res.status === 429 ? "The CV service is busy. Please try again in a moment." : message);
    }
    return res;
  }

  async generate(input: EngineGenerateInput): Promise<EngineGenerateResult> {
    const res = await this.call(
      "/api/v1/partner/cv/generate",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      GENERATE_TIMEOUT_MS,
    );
    return ((await res.json()) as { data: EngineGenerateResult }).data;
  }

  /** What a job post asks for (for the score's job match). null if it isn't a readable job post. */
  async jobRequirements(jobDescription: string): Promise<CvJobRequirements | null> {
    const res = await this.call(
      "/api/v1/partner/job/requirements",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobDescription }) },
      GENERATE_TIMEOUT_MS,
    );
    return ((await res.json()) as { data: { requirements: CvJobRequirements | null } }).data.requirements;
  }

  /** AI polish: rewrites what the failing checks point at, without inventing facts. */
  async polish(content: CvContent, templateId: string, targets: CvPolishTarget[] | "all", jobRequirements: CvJobRequirements | null): Promise<CvPolishResponse> {
    const res = await this.call(
      "/api/v1/partner/cv/polish",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, templateId, targets, jobRequirements }) },
      GENERATE_TIMEOUT_MS,
    );
    return ((await res.json()) as { data: CvPolishResponse }).data;
  }

  /** AI check: recruiter-style tips (never change the score). */
  async review(content: CvContent, templateId: string, jobRequirements: CvJobRequirements | null): Promise<CvReviewTip[]> {
    const res = await this.call(
      "/api/v1/partner/cv/review",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, templateId, jobRequirements }) },
      GENERATE_TIMEOUT_MS,
    );
    return ((await res.json()) as { data: { tips: CvReviewTip[] } }).data.tips;
  }

  /** An uploaded CV file → its text. */
  async importFile(file: { buffer: Buffer; originalname: string; mimetype: string }): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    const res = await this.call("/api/v1/partner/import", { method: "POST", body: form }, GENERATE_TIMEOUT_MS);
    return ((await res.json()) as { data: { rawText: string } }).data.rawText;
  }

  async previewHtml(content: CvContent, templateId: string): Promise<string> {
    const res = await this.call(
      "/api/v1/partner/cv/preview",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, templateId }) },
      RENDER_TIMEOUT_MS,
    );
    return ((await res.json()) as { data: { html: string } }).data.html;
  }

  async pdf(content: CvContent, templateId: string, watermark: boolean): Promise<Buffer> {
    const res = await this.call(
      "/api/v1/partner/cv/pdf",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, templateId, watermark }) },
      RENDER_TIMEOUT_MS,
    );
    return Buffer.from(await res.arrayBuffer());
  }

  /** GoMoxie's public template gallery (no partner key needed), cached. */
  async listTemplates(): Promise<CvTemplateDto[]> {
    if (this.templates && Date.now() - this.templates.at < TEMPLATES_TTL_MS) return this.templates.list;
    const res = await fetch(this.url("/api/v1/templates"), { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS) });
    if (!res.ok) throw new BadGatewayException("Couldn't load templates");
    const body = (await res.json()) as { data: { id: string; name: string; category: string }[] };
    const publicBase = this.env.GOMOXIE_PUBLIC_URL ?? this.env.GOMOXIE_API_URL!;
    const list = body.data.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      // Small WebP, pre-rendered when GoMoxie starts and cached by browsers (the big preview.png is rendered on demand).
      previewUrl: new URL(`/api/v1/templates/${encodeURIComponent(t.id)}/thumb.webp`, publicBase).toString(),
    }));
    this.templates = { at: Date.now(), list };
    return list;
  }
}
