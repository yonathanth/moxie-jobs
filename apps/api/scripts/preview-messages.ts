/**
 * Sends the bot's message preview (same as the admin /preview command) to every
 * admin in ADMIN_TELEGRAM_IDS. Read-only on the database.
 *   pnpm --filter @ethio/api preview:messages
 */
import { PrismaService } from "../src/prisma/prisma.service";
import { loadEnv } from "../src/config/env";
import { SettingsService } from "../src/settings/settings.service";
import { BotService } from "../src/bot/bot.service";
import type { UsersService } from "../src/users/users.service";

async function main() {
  const env = loadEnv();
  const prisma = new PrismaService();
  const users = { markBotBlocked: async () => undefined } as unknown as UsersService;
  const bot = new BotService(env, users, prisma, new SettingsService(prisma));
  for (const id of env.ADMIN_TELEGRAM_IDS) {
    console.log(`preview → ${id}`);
    await bot.sendPreview(Number(id), null);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
