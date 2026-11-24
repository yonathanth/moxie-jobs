import jwt from "jsonwebtoken";

/**
 * SantimPay gateway (hosted checkout, C2B). Mirrors their Node SDK 2.0
 * (santimpay-wallet-sdk): every call carries a fresh ES256 JWT over a small
 * payload, signed with our private key; callbacks to notifyUrl carry a
 * "signed-token" header signed by SantimPay.
 * Docs: "SantimPay Payment Gateway Integration Documentation" v1.3.
 */

/** SantimPay's callback-signing public key (ES256 / P-256), as shipped in SDK 2.0. */
export const SANTIMPAY_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEolRRlv+Mb6VLwSe1fPIL0O570Al2
jvTIJQdQVjj4z354gSJ3oBUI5JQXDW3pPSfqhCXyuqu3xsqJVapup3RpuA==
-----END PUBLIC KEY-----`;

/** Header carrying SantimPay's JWT on notifyUrl callbacks. */
export const CALLBACK_SIGNATURE_HEADER = "signed-token";

export interface SantimPayConfig {
  merchantId: string;
  privateKey: string;
  baseUrl: string;
  /** Overrides the built-in SantimPay public key used to verify callbacks. */
  publicKey?: string;
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

/** fetch-transaction-status response, normalized (fields we use). */
export interface SantimPayStatus {
  status: string; // COMPLETED | PENDING | FAILED | CANCELLED ...
  message?: string;
  santimPayTxnId?: string;
  id?: string;
  paymentMethod?: string;
  /** What the customer was charged; the larger of amount / totalAmount when both are reported. */
  amount?: string | number;
  currency?: string;
}

export class SantimPayError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

type Headers = Record<string, string | string[] | undefined>;

export class SantimPayClient {
  private readonly publicKey: string;

  constructor(private readonly config: SantimPayConfig) {
    this.publicKey = config.publicKey || SANTIMPAY_PUBLIC_KEY;
  }

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
    if (!data?.url) throw new SantimPayError("SantimPay returned no checkout url", 502);
    return data.url;
  }

  /** The source of truth for a payment's state. `fullParams` (SDK 2.0) also returns the amount. */
  async transactionStatus(id: string): Promise<SantimPayStatus> {
    const signedToken = this.sign({ id, merId: this.config.merchantId, generated: this.now() });
    const raw = await this.post<unknown>("/fetch-transaction-status", { id, merchantId: this.config.merchantId, signedToken, fullParams: true });
    return normalizeStatus(raw);
  }

  /**
   * Verifies a notifyUrl callback like SDK 2.0's verifyCallbackRequest: the
   * "signed-token" header must be an ES256 JWT from SantimPay, every body field
   * must match its payload, and it must be for our merchant. Returns the
   * signed payload; throws otherwise.
   */
  verifyCallback(headers: Headers, body: unknown): Record<string, unknown> {
    let token: string | undefined;
    for (const [name, value] of Object.entries(headers ?? {})) {
      if (name.toLowerCase() === CALLBACK_SIGNATURE_HEADER) {
        token = Array.isArray(value) ? value[0] : value;
        break;
      }
    }
    if (!token) throw new Error("missing signed-token header");

    const verified = jwt.verify(token, this.publicKey, { algorithms: ["ES256"] });
    const payload = (typeof verified === "string" ? JSON.parse(verified) : verified) as Record<string, unknown>;

    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      const mismatched = Object.keys(b).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(payload[k]));
      if (mismatched.length > 0) throw new Error(`body does not match signed token (${mismatched.join(", ")})`);
    }
    if (payload.merId && payload.merId !== this.config.merchantId) throw new Error("callback is for a different merchant");
    return payload;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "SantimPaySDK/1.0" },
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

/**
 * The status API answers flat ({ status, santimPayTxnId, ... }, as in the PDF)
 * or, with fullParams, with the transaction under `data` ({ Status, totalAmount,
 * currency, ... }, as in the SDK 2.0 README). Accept both.
 */
export function normalizeStatus(raw: unknown): SantimPayStatus {
  const top = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = (top.data && typeof top.data === "object" ? { ...top, ...(top.data as object) } : top) as Record<string, unknown>;
  const str = (...vals: unknown[]) => {
    for (const v of vals) if ((typeof v === "string" && v !== "") || typeof v === "number") return String(v);
    return undefined;
  };
  const amounts = [d.amount, d.totalAmount]
    .map((v) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    status: str(d.status, d.Status) ?? "",
    message: str(d.message, d.Message),
    santimPayTxnId: str(d.santimPayTxnId, d.txnId, d.TxnId),
    id: str(d.id, d.thirdPartyId),
    paymentMethod: str(d.paymentMethod, d.paymentVia, d.PaymentVia),
    amount: amounts.length ? Math.max(...amounts) : undefined,
    currency: str(d.currency, d.Currency),
  };
}

/** SantimPay statuses that mean money moved / definitely didn't. Anything else = still pending. */
export function classifyStatus(status: string | undefined): "paid" | "failed" | "cancelled" | "pending" {
  const s = (status ?? "").toUpperCase();
  if (s === "COMPLETED" || s === "SUCCESS") return "paid";
  if (s === "CANCELLED" || s === "CANCELED") return "cancelled";
  if (s === "FAILED" || s === "DECLINED" || s === "REJECTED" || s === "EXPIRED") return "failed";
  return "pending";
}
