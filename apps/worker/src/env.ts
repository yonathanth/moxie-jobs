import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.string().min(1),

    TG_API_ID: z.coerce.number().int().positive(),
    TG_API_HASH: z.string().regex(/^[a-f0-9]{32}$/, "TG_API_HASH must be 32 hex chars"),
    TG_PHONE: z.string().regex(/^\+\d{8,15}$/, "TG_PHONE must be international format, e.g. +2519..."),
    /** String session from `pnpm --filter @ethio/worker tg:login`. Empty = listener can't start. */
    TG_SESSION: z.string().default(""),

    LISTENER_ENABLED: bool.default(true),
    /** Backup poll per source for posts live updates missed (seconds). */
    POLL_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(90),
    PIPELINE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),

    AI_PROVIDER: z.enum(["gemini", "vertex"]).default("vertex"),
    AI_MODEL: z.string().default("gemini-3.5-flash-lite"),
    /** "none" = don't send reasoning_effort (model default). */
    AI_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high"]).default("none"),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
    GEMINI_API_KEY: z.string().optional(),
    VERTEX_API_KEY: z.string().optional(),
    VERTEX_PROJECT: z.string().optional(),
    VERTEX_LOCATION: z.string().default("global"),

    /** Sends alerts through the bot (Bot API sendMessage only; the API process handles updates). */
    TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]{30,}$/, "TELEGRAM_BOT_TOKEN looks malformed"),
    DELIVERY_ENABLED: bool.default(true),
    /** Mini App base URL (for "open my jobs" buttons; needs https). */
    WEB_APP_URL: z.url().default("http://localhost:3000"),
    /** API base URL (click-tracking redirect /r/:deliveryId; used only when https). */
    PUBLIC_API_URL: z.url().default("http://localhost:4000"),

    FETCH_USER_AGENT: z.string().default("GoMoxieJobsBot/1.0 (+https://job.gomoxie.app)"),

    /** Website sources (ReliefWeb API, African Union sitemap). */
    WEB_SOURCES_ENABLED: bool.default(true),
    /** Approved ReliefWeb API appname. Unset = ReliefWeb source stays off. */
    RELIEFWEB_APPNAME: z.string().trim().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "gemini" && !env.GEMINI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "required when AI_PROVIDER=gemini" });
    }
    if (env.AI_PROVIDER === "vertex" && (!env.VERTEX_API_KEY || !env.VERTEX_PROJECT)) {
      ctx.addIssue({ code: "custom", path: ["VERTEX_API_KEY"], message: "VERTEX_API_KEY and VERTEX_PROJECT required when AI_PROVIDER=vertex" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, quiet: true });
      break;
    }
  }
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
