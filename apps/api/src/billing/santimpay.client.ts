import jwt from "jsonwebtoken";

/**
 * SantimPay gateway (hosted checkout, C2B). Mirrors their Node SDK: every call
 * carries a fresh ES256 JWT over a small payload, signed with our private key.
 * Docs: "SantimPay Payment Gateway Integration Documentation" v1.3.
 */

export interface SantimPayConfig {
  merchantId: string;
  privateKey: string;
  baseUrl: string;
}

export interface InitiateArgs {
  /** Our transaction id (unique per attempt); comes back as thirdPartyId. */
  id: string;
  amount: number;
  reason: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  cancelRedirectUrl: string;
  notifyUrl: string;
  phoneNumber?: string;
}

/** fetch-transaction-status response (fields we use). */
export interface SantimPayStatus {
  status: string; // COMPLETED | PENDING | FAILED | CANCELLED ...
  message?: string;
  santimPayTxnId?: string;
  id?: string;
  paymentMethod?: string;
  amount?: string | number;
}

export class SantimPayError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

export class SantimPayClient {
  constructor(private readonly config: SantimPayConfig) {}

  /** Same token shape as the SDK: JWT payload is the JSON string itself (no iat/exp claims). */
  sign(payload: Record<string, unknown>): string {
    return jwt.sign(JSON.stringify(payload), this.config.privateKey, { algorithm: "ES256" });
  }

  private now() {
    return Math.floor(Date.now() / 1000);
  }

  /** Returns the hosted checkout URL. */
  async initiatePayment(args: InitiateArgs): Promise<string> {
    const signedToken = this.sign({
      amount: args.amount,
      paymentReason: args.reason,
      merchantId: this.config.merchantId,
      generated: this.now(),
    });
    const body: Record<string, unknown> = {
      id: args.id,
      amount: args.amount,
      reason: args.reason,
      merchantId: this.config.merchantId,
      signedToken,
      successRedirectUrl: args.successRedirectUrl,
      failureRedirectUrl: args.failureRedirectUrl,
      cancelRedirectUrl: args.cancelRedirectUrl,
      notifyUrl: args.notifyUrl,
    };
    if (args.phoneNumber) body.phoneNumber = args.phoneNumber;
    const data = await this.post<{ url?: string }>("/initiate-payment", body);
    if (!data.url) throw new SantimPayError("SantimPay returned no checkout url", 502);
    return data.url;
  }

  /** The source of truth for a payment's state (webhooks are only a hint). */
  async transactionStatus(id: string): Promise<SantimPayStatus> {
    const signedToken = this.sign({ id, merId: this.config.merchantId, generated: this.now() });
    return this.post<SantimPayStatus>("/fetch-transaction-status", { id, merchantId: this.config.merchantId, signedToken });
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON error page
    }
    if (!res.ok) {
      const d = data as { reason?: string; Reason?: string; message?: string } | null;
      throw new SantimPayError(`SantimPay ${path} ${res.status}: ${d?.reason ?? d?.Reason ?? d?.message ?? text.slice(0, 200)}`, res.status);
    }
    return data as T;
  }
}

/** SantimPay statuses that mean money moved / definitely didn't. Anything else = still pending. */
export function classifyStatus(status: string | undefined): "paid" | "failed" | "cancelled" | "pending" {
  const s = (status ?? "").toUpperCase();
  if (s === "COMPLETED" || s === "SUCCESS") return "paid";
  if (s === "CANCELLED" || s === "CANCELED") return "cancelled";
  if (s === "FAILED" || s === "DECLINED" || s === "REJECTED" || s === "EXPIRED") return "failed";
  return "pending";
}
