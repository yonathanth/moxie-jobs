import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { ENV, type Env } from "./config/config.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  app.set("trust proxy", 1); // behind Caddy/Nginx on the VPS: real client IPs for rate limiting
  app.use(helmet());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: false, maxAge: 600 });
  app.useBodyParser("json", { limit: "256kb" });
  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");
  app.get(Logger).log(`API listening on :${env.PORT} (${env.NODE_ENV})`);
}

void bootstrap();
