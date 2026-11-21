import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ResolveTermResponse } from "@ethio/shared";
import { ENV, type Env } from "../config/config.module";
import { PrismaService } from "../prisma/prisma.service";
import { TaxonomyService } from "./taxonomy.service";
import { LOCAL_ACCEPT, LOCAL_FALLBACK, normalizeTerm, rankCandidates, type Scored, type TermItem } from "./term-match";

const AI_CANDIDATES = 25;
const AI_TIMEOUT_MS = 8_000;

/**
 * Maps a typed "not listed" degree or job title to taxonomy ids, as cheaply as possible:
 *   1. saved answer for the same normalized text (TermMapping): free;
 *   2. local fuzzy match (names, aliases incl. Amharic): free;
 *   3. AI (Gemini Flash-Lite), shown only the ~25 closest candidates (~300 tokens), then saved.
 */
@Injectable()
export class TermResolverService {
  private readonly logger = new Logger(TermResolverService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  async resolve(kind: "field" | "profession", text: string): Promise<ResolveTermResponse> {
    const term = normalizeTerm(text);
    if (term.length < 2) return { ids: [] };

    const saved = await this.prisma.termMapping.findUnique({ where: { kind_term: { kind, term } } });
    if (saved) {
      await this.prisma.termMapping.update({ where: { id: saved.id }, data: { hits: { increment: 1 } } });
      return { ids: saved.ids };
    }

    const items = await this.items(kind);
    const ranked = rankCandidates(term, items, AI_CANDIDATES);
    let ids: string[] = [];
    let source: "local" | "ai" | "none" = "none";

    if (ranked[0] && ranked[0].score >= LOCAL_ACCEPT) {
      ids = [ranked[0].id];
      source = "local";
    } else if (ranked.length) {
      const fromAi = await this.askAi(kind, text.trim(), ranked).catch((err: unknown) => {
        this.logger.warn(`AI term mapping failed: ${String(err)}`);
        return null;
      });
      if (fromAi) {
        ids = fromAi;
        source = "ai";
      } else if (ranked[0]!.score >= LOCAL_FALLBACK) {
        ids = [ranked[0]!.id];
        source = "local";
      }
    }

    // Only remember confident answers (local or AI); a fallback after an AI failure may be retried later.
    if (source !== "none" || ranked.length === 0) {
      await this.prisma.termMapping
        .upsert({
          where: { kind_term: { kind, term } },
          create: { kind, term, ids, source },
          update: { hits: { increment: 1 } },
        })
        .catch(() => undefined);
    }
    return { ids };
  }

  private async items(kind: "field" | "profession"): Promise<TermItem[]> {
    const t = await this.taxonomy.get();
    if (kind === "field") return t.fieldsOfStudy.filter((f) => f.id !== "any_field");
    return t.functions.flatMap((f) => f.professions);
  }

  /** One small call: the typed text + candidate list → up to 3 ids from that list. */
  private async askAi(kind: "field" | "profession", typed: string, candidates: Scored[]): Promise<string[] | null> {
    const e = this.env;
    const vertex = e.AI_PROVIDER === "vertex";
    const key = vertex ? e.VERTEX_API_KEY : e.GEMINI_API_KEY;
    if (!key || (vertex && !e.VERTEX_PROJECT)) return null;

    const url = vertex
      ? `https://aiplatform.googleapis.com/v1/projects/${e.VERTEX_PROJECT}/locations/${e.VERTEX_LOCATION}/endpoints/openapi/chat/completions`
      : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    const model = vertex ? (e.AI_MODEL.includes("/") ? e.AI_MODEL : `google/${e.AI_MODEL}`) : e.AI_MODEL.replace(/^google\//, "");
    const what = kind === "field" ? "field of study (degree)" : "job title";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(vertex ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 60,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Map an Ethiopian job seeker's typed ${what} (English, Amharic or abbreviated) to the closest options. Reply JSON {"ids":[...]} with at most 3 ids from the options, best first; {"ids":[]} if none is a reasonable match.`,
          },
          { role: "user", content: `Typed: "${typed.slice(0, 80)}"\nOptions:\n${candidates.map((c) => `${c.id}: ${c.name}`).join("\n")}` },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = (data.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(content) as { ids?: unknown };
    const allowed = new Set(candidates.map((c) => c.id));
    return Array.isArray(parsed.ids) ? parsed.ids.filter((id): id is string => typeof id === "string" && allowed.has(id)).slice(0, 3) : [];
  }
}
