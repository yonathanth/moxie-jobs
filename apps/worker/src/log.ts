import pino from "pino";
import { env } from "./env";

export const log = pino({
  level: env().LOG_LEVEL,
  transport: env().NODE_ENV === "development" ? { target: "pino-pretty", options: { singleLine: true } } : undefined,
});
