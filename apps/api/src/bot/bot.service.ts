import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { autoRetry } from "@grammyjs/auto-retry";
import { Bot, GrammyError, HttpError, InputFile, type Context } from "grammy";
import type { User } from "@ethio/db";
import { ENV, type Env } from "../config/config.module";
import {
  MOMENT_IMAGES,
  PLAN_NAME,
  applyHowText,
  applyTarget,
  buildCard,
  capPromo,
  cvPromo,
  employerLabel,
  isPremiumJob,
  locationText,
  packsPromo,
  premiumPromo,
  renewPromo,
  resolveCvPackPrices,
  resolveLimits,
  resolvePrices,
  setupReminderText,
  upgradePromo,
  type BotPhotoMessage,
  SHARE_APP_MESSAGES,
  type ShareAppKind,
} from "@ethio/shared";
import { SettingsService } from "../settings/settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import * as M from "./bot.messages";

const ALLOWED_UPDATES = ["message", "my_chat_member", "callback_query", "inline_query"] as const;

@Injectable()
export class BotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  readonly bot: Bot;
  private polling = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
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

  /**
   * A job as a photo message the user can send to any chat from the Mini App
   * (WebApp.shareMessage): the job card image, a caption and a button that opens
   * the job straight in the Mini App. Returns the prepared message id.
   */
  async prepareJobShare(user: Pick<User, "telegramId">, share: { jobId: string; imageUrl: string; caption: string }): Promise<string> {
    const bot = `https://t.me/${this.env.TELEGRAM_BOT_USERNAME}`;
    return this.preparePhotoShare(user, {
      id: share.jobId,
      imageUrl: share.imageUrl,
      caption: share.caption,
      buttons: [
        [{ text: "View job", url: `${bot}?startapp=job_${share.jobId}` }],
        [{ text: "Get jobs that fit you", url: `${bot}?start=src_share` }],
      ],
    });
  }

  /** "Share Meklit Jobs": a picture about one thing the app does, its button opening that place in the Mini App. */
  async prepareAppShare(user: Pick<User, "telegramId">, kind: ShareAppKind): Promise<string> {
    const m = SHARE_APP_MESSAGES[kind];
    const bot = `https://t.me/${this.env.TELEGRAM_BOT_USERNAME}`;
    return this.preparePhotoShare(user, {
      id: `app${kind}`,
      imageUrl: new URL(m.image, this.env.WEB_APP_URL).toString(),
      caption: m.caption,
      buttons: [[{ text: m.button, url: `${bot}?startapp=${kind}` }]],
    });
  }

  /** A photo message the user can send to any chat (WebApp.shareMessage). Returns the prepared message id. */
  private async preparePhotoShare(
    user: Pick<User, "telegramId">,
    share: { id: string; imageUrl: string; caption: string; buttons: { text: string; url: string }[][] },
  ): Promise<string> {
    const prepared = await this.bot.api.savePreparedInlineMessage(
      Number(user.telegramId),
      {
        type: "photo",
        id: share.id.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32),
        photo_url: share.imageUrl,
        thumbnail_url: share.imageUrl,
        photo_width: 1200,
        photo_height: 630,
        caption: share.caption,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: share.buttons },
      },
      { allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true },
    );
    return prepared.id;
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
    const plan = planName === PLAN_NAME.career ? "career" : "pro";
    return this.sendPhoto(user.telegramId, MOMENT_IMAGES.plan(plan, until), M.planActivated(planName, until, this.env.WEB_APP_URL, limits));
  }

  sendPreferencesSaved(user: User, firstTime: boolean) {
    const reply = M.preferencesSaved(firstTime, this.env.WEB_APP_URL);
    return firstTime ? this.sendPhoto(user.telegramId, MOMENT_IMAGES.allSet, reply) : this.send(user, reply);
  }

  /** A marketing message's caption with its Mini App buttons (they need https; `web` overrides the base). */
  promoReply(m: BotPhotoMessage, web = this.env.WEB_APP_URL): M.Reply {
    return { text: m.caption, reply_markup: M.keyboard(...m.buttons.map((row) => row.map((b) => M.webAppButton(b.text, web, b.path)))) };
  }

  /** Telegram's id for a picture already uploaded, by its web path (identical cards aren't uploaded twice). */
  private readonly fileIds = new Map<string, string>();

  /**
   * A picture message: the card is drawn by the web app at `imagePath` and uploaded (works in local dev too).
   * If the picture can't be made, the text goes on its own. Returns false if not delivered.
   */
  async sendPhoto(chatId: bigint | number, imagePath: string, reply: M.Reply): Promise<boolean> {
    if (!this.enabled) return false;
    const chat = Number(chatId);
    try {
      let photo: string | InputFile | undefined = this.fileIds.get(imagePath);
      if (!photo) {
        const res = await fetch(new URL(imagePath, this.env.WEB_APP_URL), { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`card ${imagePath} → ${res.status}`);
        photo = new InputFile(Buffer.from(await res.arrayBuffer()), "card.jpg");
      }
      const msg = await this.bot.api.sendPhoto(chat, photo, { caption: reply.text, parse_mode: "HTML", reply_markup: reply.reply_markup });
      const id = msg.photo.at(-1)?.file_id;
      if (id) this.fileIds.set(imagePath, id);
      return true;
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 403) {
        await this.users.markBotBlocked(BigInt(chat), true);
        return false;
      }
      this.logger.warn(`photo ${imagePath} not sent, sending text: ${String(err)}`);
      await this.bot.api.sendMessage(chat, reply.text, { parse_mode: "HTML", reply_markup: reply.reply_markup, link_preview_options: { is_disabled: true } });
      return true;
    }
  }

  /**
   * Admins only (/preview): one of every message the bot sends with a picture, plus a job alert,
   * so they can be checked in Telegram. Real data where it helps (a recent job, a premium job).
   */
  async sendPreview(chat: number, first: string | null) {
    // Buttons need https; in local dev they point at the live site so the layout still shows.
    const web = this.env.WEB_APP_URL.startsWith("https://") ? this.env.WEB_APP_URL : "https://jobs.gomoxie.app";
    const settings = await this.settings.get();
    const [job, premium] = await Promise.all([
      this.prisma.job.findFirst({ where: { status: "active", employerType: { notIn: ["ngo", "un_agency", "embassy", "international_org", "foreign_company"] }, isOverseas: false }, orderBy: { firstSeenAt: "desc" } }),
      this.prisma.job.findFirst({ where: { status: "active", employerType: { in: ["ngo", "un_agency", "embassy", "international_org"] } }, orderBy: { firstSeenAt: "desc" } }),
    ]);
    const photo = (m: BotPhotoMessage) => this.promoReply(m, web);
    const label = (n: number, what: string, when: string) =>
      this.bot.api.sendMessage(chat, `<b>${n}. ${M.escapeHtml(what)}</b>\n<i>${M.escapeHtml(when)}</i>`, { parse_mode: "HTML" });
    const until = new Date(Date.now() + 30 * 24 * 3_600_000);
    const soon = new Date(Date.now() + 2 * 24 * 3_600_000);
    const freeCap = resolveLimits("free", settings).dailyJobCap ?? 10;

    await this.bot.api.sendMessage(
      chat,
      "<b>Message preview</b>\nEvery message the bot sends with a picture, plus a job alert. Buttons open the live Mini App.",
      { parse_mode: "HTML" },
    );
    let n = 0;
    await label(++n, "Welcome", "First /start");
    await this.sendPhoto(chat, MOMENT_IMAGES.welcome, M.welcomeNew(first, web));
    await label(++n, "Setup reminder", "Once, an hour+ after joining without finishing setup");
    await this.sendPhoto(chat, MOMENT_IMAGES.setup, { text: setupReminderText(first), reply_markup: M.keyboard([M.webAppButton("Set up my job alerts", web, "/app/onboarding")]) });
    await label(++n, "You're all set", "After saving preferences the first time");
    await this.sendPhoto(chat, MOMENT_IMAGES.allSet, M.preferencesSaved(true, web));
    if (job) {
      await label(++n, "Job alert", "Every matching job (no picture, no how to apply)");
      const card = buildCard(job, { sourceTitle: "Example channel", deliveryId: "preview", webAppUrl: web });
      await this.bot.api.sendMessage(chat, card.text, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: card.buttons as never } });
      await label(++n, "Shared job", "Someone opens a shared job link");
      await this.sendPhoto(chat, MOMENT_IMAGES.job(job.id), M.sharedJob({ id: job.id, title: job.title, company: job.company, closed: false }, web, false));
    }
    await label(++n, "Plan activated", "After paying for Pro or Career");
    await this.sendPhoto(chat, MOMENT_IMAGES.plan("pro", until), M.planActivated(PLAN_NAME.pro, until, web, resolveLimits("pro", settings)));
    await label(++n, "A · Upgrade", "Marketing slot (12:30 / 19:00), free users, takes turns");
    await this.sendPhoto(chat, upgradePromo(resolvePrices(settings).pro.month).image, photo(upgradePromo(resolvePrices(settings).pro.month)));
    await label(++n, "B1 · Make and tailor a CV", "Marketing slot, free users who still have their free CVs");
    await this.sendPhoto(chat, cvPromo().image, photo(cvPromo()));
    const packs = packsPromo(resolveCvPackPrices(settings));
    await label(++n, "B2 · CV packs", "Marketing slot, anyone out of CVs (free or paid)");
    await this.sendPhoto(chat, packs.image, photo(packs));
    const cap = capPromo(4, freeCap);
    await label(++n, "C · Alert limit reached", "Marketing slot, free users held back by the daily limit today");
    await this.sendPhoto(chat, cap.image, photo(cap));
    if (premium) {
      const d = premiumPromo({ id: premium.id, title: premium.title, kind: employerLabel(premium.employerType) ?? (premium.isOverseas ? "Abroad" : null), location: locationText(premium), deadline: premium.deadline });
      await label(++n, "D · Premium match", "Marketing slot, free users, when a premium job matched (employer hidden)");
      await this.sendPhoto(chat, d.image, photo(d));
    }
    const renew = renewPromo("pro", soon, false);
    await label(++n, "Renewal reminder", "Paid users, 2 days before the plan ends");
    await this.sendPhoto(chat, renew.image, photo(renew));
    const ended = renewPromo("pro", new Date(), true);
    await label(++n, "Plan ended", "Once, the day a paid plan ends");
    await this.sendPhoto(chat, ended.image, photo(ended));
  }

  private async configureProfile() {
    try {
      await this.bot.api.setMyCommands(M.BOT_COMMANDS);
      await this.bot.api.setMyDescription(M.BOT_DESCRIPTION);
      await this.bot.api.setMyShortDescription(M.BOT_SHORT_DESCRIPTION);
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
          select: { id: true, title: true, company: true, status: true, deadline: true, employerType: true, isOverseas: true },
        });
        if (job && job.status !== "hidden" && job.status !== "review") {
          const closed = job.status === "expired" || (job.deadline !== null && job.deadline <= new Date());
          // Premium jobs (NGO, UN, embassy, abroad) show the kind of employer, never the name: Pro unlocks it in the app.
          const who = isPremiumJob(job) ? (employerLabel(job.employerType) ?? (job.isOverseas ? "Abroad" : null)) : job.company;
          await this.sendPhoto(ctx.chat.id, MOMENT_IMAGES.job(job.id), M.sharedJob({ id: job.id, title: job.title, company: who, closed }, url(), !!existing?.onboardedAt));
          return;
        }
      }
      if (existing?.onboardedAt) {
        await reply(ctx, M.welcomeBack(user.firstName, url(), user.alertsPaused));
      } else {
        await this.sendPhoto(ctx.chat.id, MOMENT_IMAGES.welcome, M.welcomeNew(user.firstName, url()));
      }
    });

    pm.command("preview", async (ctx) => {
      if (!this.env.ADMIN_TELEGRAM_IDS.includes(String(ctx.from.id))) return reply(ctx, { text: M.FALLBACK_TEXT });
      await this.sendPreview(ctx.chat.id, ctx.from.first_name ?? null).catch((err: unknown) => {
        this.logger.warn(`preview failed: ${String(err)}`);
        return ctx.reply(`Preview stopped: ${String(err).slice(0, 300)}`);
      });
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
    // Inline mode is on for the Mini App's share pictures. Someone typing @bot in a chat gets
    // no results, just a button into the bot (instead of an endless spinner).
    this.bot.on("inline_query", (ctx) =>
      ctx.answerInlineQuery([], { cache_time: 3600, is_personal: false, button: { text: "Open Meklit Jobs", start_parameter: "inline" } }),
    );

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
