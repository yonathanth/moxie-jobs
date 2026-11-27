import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { BotController } from "./bot.controller";
import { BotService } from "./bot.service";
import { MessagingController } from "./messaging.controller";

@Module({
  imports: [UsersModule],
  controllers: [BotController, MessagingController],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
