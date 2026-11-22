import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");
const list = z
  .string()
  .default("")
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    DATABASE_URL: z.string().min(1),

    TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]{30,}$/, "TELEGRAM_BOT_TOKEN looks malformed"),
    TELEGRAM_BOT_USERNAME: z.string().min(1).transform((v) => v.replace(/^@/, "")),
    /** false = API only (e.g. a second API replica, or tests). */
    BOT_ENABLED: bool.default(true),
    /** polling for local dev, webhook in production. */
    BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
    TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).optional(),

    /** Public base URL of this API (webhook target). */
    PUBLIC_API_URL: z.url(),
    /** Public base URL of the web app / Mini App. */
    WEB_APP_URL: z.url(),
    CORS_ORIGINS: list,

    JWT_SECRET: z.string().min(32),
    JWT_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
    /** How old Telegram Mini App initData may be before we refuse it. */
    INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),

    /** Dev-only login without Telegram. Refused in production. */
    ALLOW_DEV_AUTH: bool.default(false),
    /** Telegram user ids with admin rights. */
    ADMIN_TELEGRAM_IDS: list,

    /** SantimPay hosted checkout. Unset = billing endpoints answer 503. */
    SANTIMPAY_MERCHANT_ID: z.string().trim().min(1).optional(),
    /** EC private key (PEM). In .env, put it on one line with literal \n between lines. */
    SANTIMPAY_PRIVATE_KEY: z
      .string()
      .optional()
      .transform((v) => (v ? v.replace(/\\n/g, "\n").trim() : undefined)),
    SANTIMPAY_BASE_URL: z.url().default("https://services.santimpay.com/api/v1/gateway"),

    /** GoMoxie CV engine (partner API). Unset = CV features answer 503. */
    GOMOXIE_API_URL: z.url().optional(),
    GOMOXIE_PARTNER_KEY: z.string().min(16).optional(),
    /** Where browsers load template pictures from (defaults to GOMOXIE_API_URL). */
    GOMOXIE_PUBLIC_URL: z.url().optional(),

    /** AI for mapping "not listed" degrees/professions (same settings as the worker). Unset keys = local matching only. */
    AI_PROVIDER: z.enum(["gemini", "vertex"]).default("vertex"),
    AI_MODEL: z.string().default("gemini-3.5-flash-lite"),
    GEMINI_API_KEY: z.string().optional(),
    VERTEX_API_KEY: z.string().optional(),
    VERTEX_PROJECT: z.string().optional(),
    VERTEX_LOCATION: z.string().default("global"),
  })
  .superRefine((env, ctx) => {
    if (env.BOT_ENABLED && env.BOT_MODE === "webhook" && !env.TELEGRAM_WEBHOOK_SECRET) {
      ctx.addIssue({ code: "custom", path: ["TELEGRAM_WEBHOOK_SECRET"], message: "required when BOT_MODE=webhook" });
    }
    if (env.NODE_ENV === "production") {
      if (env.ALLOW_DEV_AUTH) {
        ctx.addIssue({ code: "custom", path: ["ALLOW_DEV_AUTH"], message: "must be false in production" });
      }
      for (const key of ["WEB_APP_URL", "PUBLIC_API_URL"] as const) {
        if (!env[key].startsWith("https://")) {
          ctx.addIssue({ code: "custom", path: [key], message: "must be https in production" });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Loads the repo-root .env when present (local dev); in Docker the vars come from the environment. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env) {
    for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
      if (existsSync(candidate)) {
        loadDotenv({ path: candidate, quiet: true });
        break;
      }
    }
  }
  // A blank "KEY=" line in .env means "not set" (optional settings stay optional).
  const values = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const parsed = envSchema.safeParse(values);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
