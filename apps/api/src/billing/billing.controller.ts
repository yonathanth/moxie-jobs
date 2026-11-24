import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import type { User } from "@ethio/db";
import { CV_PACKS, PAID_PLANS, SOLD_PERIODS, type CheckoutResponse, type PaymentDto, type PricingDto } from "@ethio/shared";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BillingService } from "./billing.service";

// Weekly plans are no longer sold.
const checkoutSchema = z.object({ plan: z.enum(PAID_PLANS), period: z.enum(SOLD_PERIODS) }).strict();
const packCheckoutSchema = z.object({ pack: z.enum(CV_PACKS), cvId: z.uuid().optional() }).strict();

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

  /** Buy a CV pack (credits); with cvId, a credit unlocks that CV as soon as it's paid. */
  @Post("packs/checkout")
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  checkoutPack(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(packCheckoutSchema)) body: z.infer<typeof packCheckoutSchema>,
  ): Promise<CheckoutResponse> {
    return this.billing.checkoutPack(user, body);
  }

  @Get("payments/:id")
  @UseGuards(AuthGuard)
  payment(@CurrentUser() user: User, @Param("id", new ParseUUIDPipe()) id: string): Promise<PaymentDto> {
    return this.billing.getPayment(user, id);
  }

  /** SantimPay server-to-server callback. Always 200; the payment is confirmed through their status API. */
  @Post("santimpay/notify")
  @HttpCode(200)
  async notify(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: unknown): Promise<{ ok: true }> {
    await this.billing.handleNotify(headers, body);
    return { ok: true };
  }
}
