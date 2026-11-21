import { Module } from "@nestjs/common";
import { BotModule } from "../bot/bot.module";
import { CvController } from "./cv.controller";
import { CvService } from "./cv.service";
import { GomoxieClient } from "./gomoxie.client";

@Module({
  imports: [BotModule],
  controllers: [CvController],
  providers: [CvService, GomoxieClient],
  exports: [CvService],
})
export class CvModule {}
