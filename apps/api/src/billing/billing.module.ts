import { Module } from "@nestjs/common";
import { BotModule } from "../bot/bot.module";
import { CvModule } from "../cv/cv.module";
import { UsersModule } from "../users/users.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [BotModule, UsersModule, CvModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
