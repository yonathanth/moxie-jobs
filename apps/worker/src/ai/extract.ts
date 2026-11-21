import type OpenAI from "openai";
import { env } from "../env";
import { parseExtraction, type Extraction } from "./schema";
import { SYSTEM_PROMPT, taxonomyBlock, userMessage, type PostForPrompt, type TaxonomyForPrompt } from "./prompt";

export interface ExtractionResult {
  extraction: Extraction;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
  latencyMs: number;
  model: string;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly usage?: ExtractionResult["usage"],
  ) {
    super(message);
  }
}

export class Extractor {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  /** One model call per post; one retry if the reply isn't valid JSON. */
  async extract(post: PostForPrompt, taxonomy: TaxonomyForPrompt): Promise<ExtractionResult> {
    const system = `${SYSTEM_PROMPT}\n\n${taxonomyBlock(taxonomy)}`;
    const user = userMessage(post);
    const started = Date.now();
    const usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    let lastError = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        // Big multi-position posts (10+ jobs) need ~8–12k output tokens; 6k truncated them mid-JSON.
        max_tokens: 16000,
        response_format: { type: "json_object" },
        // Vertex rejects reasoning_effort "none" (400); omitting it uses the model's default (no extra thinking on Flash-Lite).
        ...(env().AI_REASONING_EFFORT !== "none" ? { reasoning_effort: env().AI_REASONING_EFFORT as never } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      usage.inputTokens += res.usage?.prompt_tokens ?? 0;
      usage.outputTokens += res.usage?.completion_tokens ?? 0;
      usage.cachedTokens += res.usage?.prompt_tokens_details?.cached_tokens ?? 0;

      const content = res.choices[0]?.message?.content ?? "";
      try {
        return { extraction: parseExtraction(content), usage, latencyMs: Date.now() - started, model: this.model };
      } catch (err) {
        lastError = `Invalid model output: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    throw new ExtractionError(lastError, usage);
  }
}
