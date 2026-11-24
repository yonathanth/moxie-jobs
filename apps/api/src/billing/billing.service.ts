import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Payment, User } from "@ethio/db";
import {
  DEFAULT_PLAN_LIMITS,
  PERIOD_LABEL,
  PLAN_NAME,
  PLAN_RANK,
  CV_PRODUCTS,
  PLANS,
  resolveLimits,
  resolvePrices,
  type CheckoutRequest,
  type CheckoutResponse,
  type PaymentDto,
  type PricingDto,
  CV_PACKS,
  CV_PACK_CONTENTS,
  cvPacks,
  resolveCvPackPrices,
  type CvPackId,
} from "@ethio/shared";
import { BotService } from "../bot/bot.service";
import { CvService } from "../cv/cv.service";
import { ENV, type Env } from "../config/config.module";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { amountMatches, nextPlanPeriod } from "./billing.rules";
import { classifyStatus, SantimPayClient, SantimPayError } from "./santimpay.client";

/** Don't ask SantimPay about the same payment more often than this (return-page polling). */
const VERIFY_GAP_MS = 4_000;
/** A checkout never completed after this long is closed as failed. */
const ABANDON_AFTER_MS = 6 * 60 * 60_000;
/** Pending payments are re-checked this often, in case SantimPay's callback never arrives (docs FAQ Q6). */
const RECONCILE_EVERY_MS = 2 * 60_000;

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingService.name);
  private readonly client: SantimPayClient | null;
  private readonly lastVerify = new Map<string, number>();
  private reconcileTimer: NodeJS.Timeout | null = null;
  private reconciling = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly bot: BotService,
    private readonly cvs: CvService,
  ) {
    this.client =
      env.SANTIMPAY_MERCHANT_ID && env.SANTIMPAY_PRIVATE_KEY
        ? new SantimPayClient({
            merchantId: env.SANTIMPAY_MERCHANT_ID,
            privateKey: env.SANTIMPAY_PRIVATE_KEY,
            baseUrl: env.SANTIMPAY_BASE_URL,
            publicKey: env.SANTIMPAY_PUBLIC_KEY,
          })
        : null;
    if (!this.client) this.logger.warn("SantimPay not configured (SANTIMPAY_MERCHANT_ID / SANTIMPAY_PRIVATE_KEY): checkout disabled");
  }

  // Production only: local dev shares the database, and activating a payment messages the user.
  onModuleInit() {
    if (!this.client || this.env.NODE_ENV !== "production") return;
    this.reconcileTimer = setInterval(() => void this.reconcile(), RECONCILE_EVERY_MS);
    this.reconcileTimer.unref();
  }

  onModuleDestroy() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

  /** Re-checks pending payments with SantimPay; verify() also closes ones abandoned for ABANDON_AFTER_MS. */
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const pending = await this.prisma.payment.findMany({
        where: { status: "pending", createdAt: { lt: new Date(Date.now() - 60_000) } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      for (const { id } of pending) {
        await this.verify(id).catch((err: unknown) => this.logger.warn(`reconcile ${id} failed: ${String(err)}`));
      }
    } catch (err) {
      this.logger.error(`reconcile failed: ${String(err)}`);
    } finally {
      this.reconciling = false;
    }
  }

  async pricing(): Promise<PricingDto> {
    const settings = await this.settings.get();
    const limits = Object.fromEntries(PLANS.map((p) => [p, resolveLimits(p, settings)])) as Record<(typeof PLANS)[number], typeof DEFAULT_PLAN_LIMITS.free>;
    return { currency: "ETB", prices: resolvePrices(settings), limits, packs: cvPacks(settings) };
  }

  async checkout(user: User, req: CheckoutRequest): Promise<CheckoutResponse> {
    if (!this.client) throw new ServiceUnavailableException("Payments are not available right now");
    const now = new Date();
    const active = user.planExpiresAt !== null && user.planExpiresAt > now && (user.plan === "pro" || user.plan === "career");
    if (active && PLAN_RANK[user.plan as "pro" | "career"] > PLAN_RANK[req.plan]) {
      throw new ConflictException(`You already have ${PLAN_NAME[user.plan as "career"]} until ${user.planExpiresAt!.toISOString().slice(0, 10)}`);
    }

    const amount = resolvePrices(await this.settings.get())[req.plan][req.period];
    const payment = await this.prisma.payment.create({ data: { userId: user.id, plan: req.plan, period: req.period, amount } });
    return this.startCheckout(payment, `Ethio Jobs ${PLAN_NAME[req.plan]} (${PERIOD_LABEL[req.period]})`);
  }

  /** Buy a CV pack. With cvId, one of its credits unlocks that (locked) CV once paid. */
  async checkoutPack(user: User, req: { pack: CvPackId; cvId?: string }): Promise<CheckoutResponse> {
    if (!this.client) throw new ServiceUnavailableException("Payments are not available right now");
    if (req.cvId) {
      const cv = await this.prisma.cvDocument.findUnique({ where: { id: req.cvId } });
      if (!cv || cv.deletedAt || cv.userId !== user.id) throw new NotFoundException("CV not found");
    }
    const amount = resolveCvPackPrices(await this.settings.get())[req.pack];
    const payment = await this.prisma.payment.create({
      data: { userId: user.id, plan: req.pack, period: "one_time", amount, cvDocumentId: req.cvId ?? null },
    });
    return this.startCheckout(payment, `Moxie Jobs ${CV_PACK_CONTENTS[req.pack].name} CV pack`);
  }

  private async startCheckout(payment: Payment, reason: string): Promise<CheckoutResponse> {
    const back = (result: string) => {
      const url = new URL("/billing/return", this.env.WEB_APP_URL);
      url.searchParams.set("payment", payment.id);
      url.searchParams.set("result", result);
      return url.toString();
    };
    try {
      const url = await this.client!.initiatePayment({
        id: payment.id,
        amount: payment.amount,
        reason,
        successRedirectUrl: back("success"),
        failureRedirectUrl: back("failure"),
        cancelRedirectUrl: back("cancel"),
        notifyUrl: new URL("/billing/santimpay/notify", this.env.PUBLIC_API_URL).toString(),
      });
      this.logger.log(`checkout ${payment.id} user=${payment.userId} ${payment.plan}/${payment.period} ${payment.amount} ETB`);
      return { paymentId: payment.id, url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "failed", error: message.slice(0, 500) } });
      this.logger.error(`checkout failed ${payment.id}: ${message}`);
      throw new BadGatewayException("Couldn't start the payment. Please try again.");
    }
  }

  /** The payment as the Mini App sees it; checks with SantimPay while it's still pending. */
  async getPayment(user: User, id: string): Promise<PaymentDto> {
    let payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.userId !== user.id) throw new ForbiddenException();
    if (payment.status === "pending") payment = (await this.verify(id)) ?? payment;
    return toDto(payment);
  }

  /**
   * Webhook. The callback only tells us which payment to look at; SantimPay's
   * status API still decides. A callback whose "signed-token" checks out (SDK
   * 2.0) skips the per-payment throttle; an unsigned or forged one is logged
   * and only gets a throttled status check, so it can't change anything or make
   * us hammer SantimPay. Never throws.
   */
  async handleNotify(headers: Record<string, string | string[] | undefined>, body: unknown): Promise<void> {
    if (!this.client) return;
    let signed: Record<string, unknown> | null = null;
    try {
      signed = this.client.verifyCallback(headers, body);
    } catch (err) {
      this.logger.warn(`notify signature not verified (${err instanceof Error ? err.message : String(err)}): ${JSON.stringify(body ?? null).slice(0, 300)}`);
    }
    const b = (signed ?? body ?? {}) as Record<string, unknown>;
    const id = typeof b.thirdPartyId === "string" ? b.thirdPartyId : typeof b.id === "string" ? b.id : null;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      this.logger.warn(`notify without a usable id: ${JSON.stringify(b).slice(0, 300)}`);
      return;
    }
    if (signed) this.lastVerify.delete(id); // genuine fresh news from SantimPay: don't throttle it
    await this.verify(id).catch((err: unknown) => this.logger.error(`notify verify ${id} failed: ${String(err)}`));
  }

  /**
   * Asks SantimPay for the payment's state and applies it. Idempotent: the
   * pending → paid switch is a conditional update, so concurrent notify/poll
   * calls activate a plan exactly once. Returns the updated row.
   */
  async verify(id: string): Promise<Payment | null> {
    if (!this.client) return null;
    const last = this.lastVerify.get(id) ?? 0;
    if (Date.now() - last < VERIFY_GAP_MS) return null;
    this.lastVerify.set(id, Date.now());

    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.status !== "pending") return payment;

    let state: ReturnType<typeof classifyStatus>;
    let remote: Awaited<ReturnType<SantimPayClient["transactionStatus"]>> | null = null;
    try {
      remote = await this.client.transactionStatus(id);
      state = classifyStatus(remote.status);
    } catch (err) {
      // "record not found" until the user opens the checkout page: still pending.
      // Their docs say 400; production answers 500 for it.
      if (err instanceof SantimPayError && /record not found/i.test(err.message)) state = "pending";
      else throw err;
    }

    if (state === "pending") {
      if (Date.now() - payment.createdAt.getTime() > ABANDON_AFTER_MS) {
        return this.prisma.payment.update({ where: { id }, data: { status: "failed", error: "abandoned" } });
      }
      return payment;
    }
    if (state === "failed" || state === "cancelled") {
      await this.prisma.payment.updateMany({ where: { id, status: "pending" }, data: { status: state, error: remote?.message ?? null } });
      return this.prisma.payment.findUnique({ where: { id } });
    }
    const wrongCurrency = !!remote?.currency && remote.currency.toUpperCase() !== "ETB";
    if (wrongCurrency || !amountMatches(payment.amount, remote?.amount)) {
      this.logger.error(`payment ${id}: amount mismatch (expected ${payment.amount} ETB, got ${String(remote?.amount)} ${remote?.currency ?? ""})`);
      await this.prisma.payment.updateMany({ where: { id, status: "pending" }, data: { status: "failed", error: "amount_mismatch" } });
      return this.prisma.payment.findUnique({ where: { id } });
    }
    return this.activate(payment, remote);
  }

  private async activate(payment: Payment, remote: { santimPayTxnId?: string; paymentMethod?: string } | null): Promise<Payment> {
    if ((CV_PACKS as readonly string[]).includes(payment.plan)) return this.activatePack(payment, remote);
    if ((CV_PRODUCTS as readonly string[]).includes(payment.plan)) return this.activateCv(payment, remote);
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: "pending" }, data: { status: "paid", paidAt: now } });
      if (claimed.count === 0) return null; // another request activated it
      const user = await tx.user.findUniqueOrThrow({ where: { id: payment.userId } });
      const { start, end } = nextPlanPeriod(user, { plan: payment.plan as "pro" | "career", period: payment.period as "week" }, now);
      await tx.user.update({ where: { id: user.id }, data: { plan: payment.plan, planExpiresAt: end } });
      // Touching preferences makes the worker re-run its backfill: premium jobs locked so far get sent.
      await tx.userPreferences.updateMany({ where: { userId: user.id }, data: { updatedAt: now } });
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          periodStart: start,
          periodEnd: end,
          providerTxnId: remote?.santimPayTxnId ?? null,
          paymentVia: remote?.paymentMethod ?? null,
        },
      });
      return { user, updated, end };
    });
    if (!result) return (await this.prisma.payment.findUnique({ where: { id: payment.id } }))!;

    this.logger.log(`payment ${payment.id} paid: user=${payment.userId} ${payment.plan} until ${result.end.toISOString()}`);
    // CVs made while on free (watermarked) that the new plan covers are unlocked now.
    const unlocked = await this.cvs.unlockWithPlan(payment.userId).catch((err: unknown) => {
      this.logger.warn(`unlocking CVs after payment ${payment.id} failed: ${String(err)}`);
      return 0;
    });
    if (unlocked) this.logger.log(`payment ${payment.id}: unlocked ${unlocked} CV(s) with the plan`);
    const limits = resolveLimits(payment.plan as "pro" | "career", await this.settings.get());
    await this.bot
      .sendPlanActivated(result.user, PLAN_NAME[payment.plan as "pro" | "career"], result.end, limits)
      .catch((err: unknown) => this.logger.warn(`plan activated message failed: ${String(err)}`));
    return result.updated;
  }

  /** A paid CV pack: credits are added; if bought for a locked CV, one credit unlocks it and the clean PDF is sent. */
  private async activatePack(payment: Payment, remote: { santimPayTxnId?: string; paymentMethod?: string } | null): Promise<Payment> {
    const now = new Date();
    const pack = CV_PACK_CONTENTS[payment.plan as CvPackId];
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: "pending" }, data: { status: "paid", paidAt: now } });
      if (claimed.count === 0) return null;
      await tx.user.update({ where: { id: payment.userId }, data: { cvNewCredits: { increment: pack.newCvs }, cvTailorCredits: { increment: pack.tailored } } });
      let unlockedCv: string | null = null;
      if (payment.cvDocumentId) {
        const cv = await tx.cvDocument.findFirst({ where: { id: payment.cvDocumentId, userId: payment.userId, charge: "locked", deletedAt: null } });
        if (cv) {
          const column = cv.lockedProduct === "cv_tailor" ? "cvTailorCredits" : "cvNewCredits";
          await tx.user.update({ where: { id: payment.userId }, data: { [column]: { decrement: 1 } } });
          await tx.cvDocument.update({ where: { id: cv.id }, data: { charge: "credit", lockedProduct: null, unlockedAt: now } });
          unlockedCv = cv.id;
        }
      }
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { providerTxnId: remote?.santimPayTxnId ?? null, paymentVia: remote?.paymentMethod ?? null },
      });
      return { updated, unlockedCv };
    });
    if (!result) return (await this.prisma.payment.findUnique({ where: { id: payment.id } }))!;
    this.logger.log(`payment ${payment.id} paid: user=${payment.userId} ${payment.plan}${result.unlockedCv ? ` unlocked CV ${result.unlockedCv}` : ""}`);
    const user = await this.prisma.user.findUnique({ where: { id: payment.userId } });
    if (user) {
      await this.bot
        .send(user, {
          text: `<b>Your ${pack.name} CV pack is ready</b>\n\n${pack.newCvs} new or improved CVs and ${pack.tailored} tailored CVs. They never expire.`,
        })
        .catch((err: unknown) => this.logger.warn(`pack message failed: ${String(err)}`));
      if (result.unlockedCv) await this.cvs.sendPdf(user, result.unlockedCv).catch((err: unknown) => this.logger.warn(`unlocked CV PDF not sent: ${String(err)}`));
    }
    return result.updated;
  }

  /** (Old single-CV payments.) A paid CV unlock: the CV loses its watermark and the clean PDF goes to the person's chat. */
  private async activateCv(payment: Payment, remote: { santimPayTxnId?: string; paymentMethod?: string } | null): Promise<Payment> {
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: "pending" }, data: { status: "paid", paidAt: now } });
      if (claimed.count === 0) return null;
      if (payment.cvDocumentId) {
        await tx.cvDocument.updateMany({
          where: { id: payment.cvDocumentId, userId: payment.userId, charge: "locked" },
          data: { charge: "purchase", lockedProduct: null, unlockedAt: now },
        });
      }
      return tx.payment.update({
        where: { id: payment.id },
        data: { providerTxnId: remote?.santimPayTxnId ?? null, paymentVia: remote?.paymentMethod ?? null },
      });
    });
    if (!updated) return (await this.prisma.payment.findUnique({ where: { id: payment.id } }))!;
    this.logger.log(`payment ${payment.id} paid: user=${payment.userId} unlocked CV ${payment.cvDocumentId}`);
    if (payment.cvDocumentId) {
      const user = await this.prisma.user.findUnique({ where: { id: payment.userId }, select: { id: true, telegramId: true } });
      if (user) await this.cvs.sendPdf(user, payment.cvDocumentId).catch((err: unknown) => this.logger.warn(`unlocked CV PDF not sent: ${String(err)}`));
    }
    return updated;
  }
}

function toDto(p: Payment): PaymentDto {
  return {
    id: p.id,
    plan: p.plan as PaymentDto["plan"],
    period: p.period as PaymentDto["period"],
    amount: p.amount,
    status: p.status as PaymentDto["status"],
    periodEnd: p.periodEnd?.toISOString() ?? null,
  };
}
