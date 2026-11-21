import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import type { User } from "@ethio/db";
import { BILLING_PERIODS, PAID_PLANS, type CheckoutResponse, type PaymentDto, type PricingDto } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BillingService } from "./billing.service";

const checkoutSchema = z.object({ plan: z.enum(PAID_PLANS), period: z.enum(BILLING_PERIODS) }).strict();

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Prices and what each plan includes (public: the landing page can show it too). */
  @Get("plans")
  plans(): Promise<PricingDto> {
    return this.billing.pricing();
  }

  @Post("checkout")
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  checkout(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(checkoutSchema)) body: z.infer<typeof checkoutSchema>,
  ): Promise<CheckoutResponse> {
    return this.billing.checkout(user, body);
  }

  /** Unlock a CV made on "pay at download". */
  @Post("cv/:id/checkout")
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  checkoutCv(@CurrentUser() user: User, @Param("id", new ParseUUIDPipe()) id: string): Promise<CheckoutResponse> {
    return this.billing.checkoutCv(user, id);
  }

  @Get("payments/:id")
  @UseGuards(AuthGuard)
  payment(@CurrentUser() user: User, @Param("id", new ParseUUIDPipe()) id: string): Promise<PaymentDto> {
    return this.billing.getPayment(user, id);
  }

  /** SantimPay server-to-server callback. Always 200; the payment is confirmed through their status API. */
  @Post("santimpay/notify")
  @HttpCode(200)
  async notify(@Body() body: unknown): Promise<{ ok: true }> {
    await this.billing.handleNotify(body);
    return { ok: true };
  }
}
