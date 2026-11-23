import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { autoRetry } from "@grammyjs/auto-retry";
import { Bot, GrammyError, HttpError, InputFile, type Context } from "grammy";
import type { User } from "@ethio/db";
import { ENV, type Env } from "../config/config.module";
import { applyHowText, applyTarget } from "@ethio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import * as M from "./bot.messages";

const ALLOWED_UPDATES = ["message", "my_chat_member", "callback_query"] as const;

@Injectable()
export class BotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  readonly bot: Bot;
  private polling = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {
    this.bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    // Retries on 429 (flood wait) and 5xx with Telegram's suggested delay.
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));
    this.registerHandlers();
  }

  get enabled() {
    return this.env.BOT_ENABLED;
  }

  async onApplicationBootstrap() {
    if (!this.enabled) {
      this.logger.log("Bot disabled (BOT_ENABLED=false)");
      return;
    }
    await this.bot.init();
    await this.configureProfile();

    if (this.env.BOT_MODE === "webhook") {
      const url = new URL("/telegram/webhook", this.env.PUBLIC_API_URL).toString();
      await this.bot.api.setWebhook(url, {
        secret_token: this.env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: [...ALLOWED_UPDATES],
      });
      this.logger.log(`@${this.bot.botInfo.username} receiving updates via webhook ${url}`);
    } else {
      await this.bot.api.deleteWebhook();
      this.polling = true;
      // Not awaited: start() resolves only when polling stops.
      void this.bot
        .start({ allowed_updates: [...ALLOWED_UPDATES], onStart: (me) => this.logger.log(`@${me.username} polling for updates`) })
        .catch((err: unknown) => this.logger.error(`Polling stopped: ${String(err)}`));
    }
  }

  async onModuleDestroy() {
    if (this.polling) await this.bot.stop();
  }

  /** Sends a message to a user; marks them as blocked when Telegram says so. Returns false if not delivered. */
  async send(user: Pick<User, "telegramId">, reply: M.Reply): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.bot.api.sendMessage(Number(user.telegramId), reply.text, {
        parse_mode: "HTML",
        reply_markup: reply.reply_markup,
        link_preview_options: { is_disabled: true },
      });
      return true;
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 403) {
        await this.users.markBotBlocked(user.telegramId, true);
        return false;
      }
      throw err;
    }
  }

  /** Sends a file (e.g. a CV PDF) to the user's chat. Returns false if not delivered. */
  async sendDocument(user: Pick<User, "telegramId">, file: Buffer, filename: string, caption: string, reply?: Pick<M.Reply, "reply_markup">): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.bot.api.sendDocument(Number(user.telegramId), new InputFile(file, filename), {
        caption,
        parse_mode: "HTML",
        reply_markup: reply?.reply_markup,
      });
      return true;
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 403) {
        await this.users.markBotBlocked(user.telegramId, true);
        return false;
      }
      // e.g. 400 "chat not found": they never pressed Start. The caller tells them.
      if (err instanceof GrammyError) {
        this.logger.warn(`sendDocument to ${user.telegramId} failed: ${err.description}`);
        return false;
      }
      throw err;
    }
  }

  sendPlanActivated(user: User, planName: string, until: Date, limits: { premiumJobs: boolean; dailyJobCap: number | null }) {
    return this.send(user, M.planActivated(planName, until, this.env.WEB_APP_URL, limits));
  }

  sendPreferencesSaved(user: User, firstTime: boolean) {
    return this.send(user, M.preferencesSaved(firstTime, this.env.WEB_APP_URL));
  }

  private async configureProfile() {
    try {
      await this.bot.api.setMyCommands(M.BOT_COMMANDS);
      if (this.env.WEB_APP_URL.startsWith("https://")) {
        await this.bot.api.setChatMenuButton({
          menu_button: { type: "web_app", text: "Jobs", web_app: { url: new URL("/app/jobs", this.env.WEB_APP_URL).toString() } },
        });
      }
    } catch (err) {
      // Cosmetic; never block startup on it.
      this.logger.warn(`Could not set bot commands/menu: ${String(err)}`);
    }
  }

  private registerHandlers() {
    const pm = this.bot.chatType("private");
    const url = () => this.env.WEB_APP_URL;
    const reply = (ctx: Context, r: M.Reply) =>
      ctx.reply(r.text, { parse_mode: "HTML", reply_markup: r.reply_markup, link_preview_options: { is_disabled: true } });

    pm.command("start", async (ctx) => {
      const existing = await this.users.findByTelegramId(ctx.from.id);
      const user = await this.users.upsertFromTelegram(ctx.from, { startParam: ctx.match || undefined });
      // A shared job link (jobs.gomoxie.app/j/:id → t.me/<bot>?start=job_<id>): show that job first.
      const shared = /^job_([0-9a-f-]{36})$/i.exec(ctx.match ?? "");
      if (shared) {
        const job = await this.prisma.job.findUnique({
          where: { id: shared[1] },
          select: { id: true, title: true, company: true, status: true, deadline: true },
        });
        if (job && job.status !== "hidden" && job.status !== "review") {
          const closed = job.status === "expired" || (job.deadline !== null && job.deadline <= new Date());
          await reply(ctx, M.sharedJob({ id: job.id, title: job.title, company: job.company, closed }, url(), !!existing?.onboardedAt));
          return;
        }
      }
      if (existing?.onboardedAt) {
        await reply(ctx, M.welcomeBack(user.firstName, url(), user.alertsPaused));
      } else {
        await reply(ctx, M.welcomeNew(user.firstName, url()));
      }
    });

    pm.command("settings", async (ctx) => {
      const user = await this.users.upsertFromTelegram(ctx.from);
      await reply(ctx, user.onboardedAt ? M.settingsReply(url()) : M.needsOnboarding(url()));
    });

    pm.command("jobs", async (ctx) => {
      const user = await this.users.upsertFromTelegram(ctx.from);
      await reply(ctx, user.onboardedAt ? M.jobsReply(url()) : M.needsOnboarding(url()));
    });

    pm.command("pause", async (ctx) => {
      const user = await this.users.upsertFromTelegram(ctx.from);
      await this.users.setAlertsPaused(user.id, true);
      await ctx.reply(M.PAUSED_TEXT);
    });

    pm.command("resume", async (ctx) => {
      const user = await this.users.upsertFromTelegram(ctx.from);
      await this.users.setAlertsPaused(user.id, false);
      if (user.onboardedAt) await ctx.reply(M.RESUMED_TEXT);
      else await reply(ctx, M.needsOnboarding(url()));
    });

    // "More jobs" on a job card when the Mini App can't open (http in local dev).
    this.bot.callbackQuery("mj", async (ctx) => {
      await ctx.answerCallbackQuery();
      await reply(ctx, M.jobsReply(url()));
    });

    // "Get a CV tailored to this job" when the Mini App can't open (http in local dev).
    this.bot.callbackQuery(/^cv:([0-9a-f-]{36})$/, async (ctx) => {
      const delivery = await this.prisma.delivery.findUnique({ where: { id: ctx.match[1] }, include: { job: { select: { id: true, title: true } } } });
      await ctx.answerCallbackQuery();
      if (!delivery) return;
      await reply(ctx, M.cvTailorPrompt(delivery.job.title, delivery.job.id, url()));
    });

    // Apply button on cards sent before Apply became a direct link.
    this.bot.callbackQuery(/^ap:([0-9a-f-]{36})$/, async (ctx) => {
      const delivery = await this.prisma.delivery.findUnique({ where: { id: ctx.match[1] }, include: { job: true } });
      const owner = delivery && (await this.prisma.user.findUnique({ where: { id: delivery.userId }, select: { telegramId: true } }));
      if (!delivery || !owner || owner.telegramId !== BigInt(ctx.from.id)) {
        await ctx.answerCallbackQuery({ text: "This job is no longer available." });
        return;
      }
      await ctx.answerCallbackQuery();
      const job = delivery.job;
      const target = applyTarget(job);
      // Click tracking (/r/:deliveryId) needs a public https API; otherwise link straight to the target.
      const applyUrl = this.env.PUBLIC_API_URL.startsWith("https://")
        ? new URL(`/r/${delivery.id}`, this.env.PUBLIC_API_URL).toString()
        : /^https?:\/\//i.test(target.url)
          ? target.url
          : null;
      await reply(
        ctx,
        M.applyPrompt({
          title: job.title,
          closed: job.status !== "active" || (job.deadline !== null && job.deadline < new Date()),
          how: applyHowText(job),
          applyUrl,
          applyLabel: target.label,
        }),
      );
    });

    pm.command("help", (ctx) => ctx.reply(M.HELP_TEXT, { parse_mode: "HTML" }));

    // User blocked / unblocked the bot.
    this.bot.on("my_chat_member", async (ctx) => {
      if (ctx.chat.type !== "private") return;
      const status = ctx.myChatMember.new_chat_member.status;
      await this.users.markBotBlocked(ctx.myChatMember.from.id, status === "kicked");
    });

    pm.on("message", (ctx) => ctx.reply(M.FALLBACK_TEXT));

    this.bot.catch((err) => {
      const e = err.error;
      const where = `update ${err.ctx.update.update_id}`;
      if (e instanceof GrammyError) this.logger.error(`Telegram API error in ${where}: ${e.description}`);
      else if (e instanceof HttpError) this.logger.error(`Network error in ${where}: ${String(e.error)}`);
      else this.logger.error(`Handler error in ${where}: ${e instanceof Error ? e.stack : String(e)}`);
    });
  }
}
