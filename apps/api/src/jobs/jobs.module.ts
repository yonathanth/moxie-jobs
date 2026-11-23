import { Module } from "@nestjs/common";
import { JobsController, PublicJobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  controllers: [JobsController, PublicJobsController],
  providers: [JobsService],
})
export class JobsModule {}
