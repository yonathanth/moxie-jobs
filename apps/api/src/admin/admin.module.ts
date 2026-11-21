import { Module } from "@nestjs/common";
import { BotModule } from "../bot/bot.module";
import { TaxonomyModule } from "../taxonomy/taxonomy.module";
import { UsersModule } from "../users/users.module";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "./admin.guard";
import { AdminUsersService } from "./admin-users.service";
import { AdminService } from "./admin.service";

@Module({
  imports: [UsersModule, TaxonomyModule, BotModule],
  controllers: [AdminController],
  providers: [AdminService, AdminUsersService, AdminGuard],
})
export class AdminModule {}
