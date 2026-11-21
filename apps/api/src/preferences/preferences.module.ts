import { Module } from "@nestjs/common";
import { BotModule } from "../bot/bot.module";
import { TaxonomyModule } from "../taxonomy/taxonomy.module";
import { PreferencesController } from "./preferences.controller";
import { PreferencesService } from "./preferences.service";

@Module({
  imports: [TaxonomyModule, BotModule],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
