import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { BillingModule } from "./billing/billing.module";
import { CvModule } from "./cv/cv.module";
import { JobsModule } from "./jobs/jobs.module";
import { BotModule } from "./bot/bot.module";
import { ConfigModule } from "./config/config.module";
import { loadEnv } from "./config/env";
import { HealthController } from "./health/health.controller";
import { PreferencesModule } from "./preferences/preferences.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedirectController } from "./redirect/redirect.controller";
import { SettingsModule } from "./settings/settings.module";
import { TaxonomyModule } from "./taxonomy/taxonomy.module";
import { UsersModule } from "./users/users.module";

const env = loadEnv();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        transport: env.NODE_ENV === "development" ? { target: "pino-pretty", options: { singleLine: true } } : undefined,
        // Never log credentials.
        redact: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-telegram-bot-api-secret-token"]'],
        autoLogging: { ignore: (req) => req.url === "/health" },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ConfigModule,
    PrismaModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    TaxonomyModule,
    PreferencesModule,
    BotModule,
    BillingModule,
    JobsModule,
    CvModule,
    AdminModule,
  ],
  controllers: [HealthController, RedirectController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
