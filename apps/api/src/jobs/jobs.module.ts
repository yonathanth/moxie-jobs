import { Module } from "@nestjs/common";
import { BotModule } from "../bot/bot.module";
import { JobsController, PublicJobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [BotModule],
  controllers: [JobsController, PublicJobsController],
  providers: [JobsService],
})
export class JobsModule {}
