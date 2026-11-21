import OpenAI from "openai";
import { env } from "../env";

/** Gemini through Google's OpenAI-compatible endpoints (same approach as GoMoxie's backend). */
export function createAiClient(): { client: OpenAI; model: string } {
  const e = env();
  if (e.AI_PROVIDER === "vertex") {
    return {
      client: new OpenAI({
        apiKey: e.VERTEX_API_KEY!,
        baseURL: `https://aiplatform.googleapis.com/v1/projects/${e.VERTEX_PROJECT}/locations/${e.VERTEX_LOCATION}/endpoints/openapi`,
        // Vertex authenticates with the API key header, not a bearer token.
        defaultHeaders: { "x-goog-api-key": e.VERTEX_API_KEY!, Authorization: null },
        timeout: e.AI_TIMEOUT_MS,
        maxRetries: 2,
      }),
      model: e.AI_MODEL.includes("/") ? e.AI_MODEL : `google/${e.AI_MODEL}`,
    };
  }
  return {
    client: new OpenAI({
      apiKey: e.GEMINI_API_KEY!,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      timeout: e.AI_TIMEOUT_MS,
      maxRetries: 2,
    }),
    model: e.AI_MODEL.replace(/^google\//, ""),
  };
}
