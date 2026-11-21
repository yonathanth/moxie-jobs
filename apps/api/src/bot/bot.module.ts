import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { BotController } from "./bot.controller";
import { BotService } from "./bot.service";

@Module({
  imports: [UsersModule],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
