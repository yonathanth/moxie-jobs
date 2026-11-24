import { prisma } from "../db";
import { env } from "../env";
import { log } from "../log";
import { MOMENT_IMAGES, setupReminderText } from "@ethio/shared";
import { BotBlockedError, sendPhoto } from "./bot-api";
import { loadSettings } from "./matcher";
import { sendTimeAfterQuiet } from "./schedule";

/**
 * One reminder for people who opened the bot but never finished setup: sent
 * once, at least an hour after they arrived, never during quiet hours, and
 * only to people who arrived in the last week (no blast at launch).
 */

const CHECK_MS = 10 * 60_000;
const WAIT_MS = 60 * 60_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export { setupReminderText as nudgeText } from "@ethio/shared";

export class OnboardingNudge {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  start() {
    void this.run();
    this.timer = setInterval(() => void this.run(), CHECK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try {
      const settings = await loadSettings();
      if (sendTimeAfterQuiet(now, settings.delivery.quietFromEat, settings.delivery.quietToEat) > now) return 0;

      const users = await prisma.user.findMany({
        where: {
          onboardedAt: null,
          onboardingNudgedAt: null,
          botBlockedAt: null,
          createdAt: { lte: new Date(now.getTime() - WAIT_MS), gte: new Date(now.getTime() - MAX_AGE_MS) },
        },
        take: 200,
      });
      const base = env().WEB_APP_URL;
      const button = base.startsWith("https://")
        ? [[{ text: "Set up my job alerts", web_app: { url: new URL("/app/onboarding", base).toString() } }]]
        : undefined;

      let sent = 0;
      for (const user of users) {
        // Mark first: a crash after sending must never cause a second reminder.
        const claimed = await prisma.user.updateMany({ where: { id: user.id, onboardingNudgedAt: null }, data: { onboardingNudgedAt: now } });
        if (!claimed.count) continue;
        try {
          await sendPhoto(user.telegramId, MOMENT_IMAGES.setup, setupReminderText(user.firstName), { buttons: button });
          sent++;
        } catch (err) {
          if (err instanceof BotBlockedError) await prisma.user.update({ where: { id: user.id }, data: { botBlockedAt: new Date() } });
          else log.warn({ user: user.id, error: String(err) }, "setup reminder failed");
        }
      }
      if (sent) log.info({ users: sent }, "setup reminders sent");
      return sent;
    } catch (err) {
      log.error({ error: String(err) }, "setup reminder run failed");
      return 0;
    } finally {
      this.busy = false;
    }
  }
}
