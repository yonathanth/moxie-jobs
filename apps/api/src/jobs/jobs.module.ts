import { Module } from "@nestjs/common";
import { BotModule } from "../bot/bot.module";
import { JobsController, PublicJobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { ShareController } from "./share.controller";

@Module({
  imports: [BotModule],
  controllers: [JobsController, PublicJobsController, ShareController],
  providers: [JobsService],
})
export class JobsModule {}
