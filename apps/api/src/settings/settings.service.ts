import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { parseSettings, type Settings } from "./plan";

const CACHE_MS = 60_000;

/** Reads admin settings (Setting table, one row per key) with a short cache. */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: { value: Settings; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<Settings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;

    const { settings: value, error } = parseSettings(await this.prisma.setting.findMany());
    if (error) this.logger.error(`Invalid settings in DB, using defaults: ${error}`);
    this.cache = { value, at: Date.now() };
    return value;
  }

  invalidate() {
    this.cache = null;
  }
}
