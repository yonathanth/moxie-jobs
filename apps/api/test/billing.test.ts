import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { amountMatches, nextPlanPeriod } from "../src/billing/billing.rules";
import { classifyStatus, SantimPayClient } from "../src/billing/santimpay.client";

const NOW = new Date("2026-11-21T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("nextPlanPeriod", () => {
  it("starts now for a free user", () => {
    const { start, end } = nextPlanPeriod({ plan: "free", planExpiresAt: null }, { plan: "pro", period: "month" }, NOW);
    expect(start).toEqual(NOW);
    expect(end).toEqual(new Date(NOW.getTime() + 30 * DAY));
  });

  it("extends a renewal of the same plan from its current end", () => {
    const expires = new Date(NOW.getTime() + 5 * DAY);
    const { start, end } = nextPlanPeriod({ plan: "pro", planExpiresAt: expires }, { plan: "pro", period: "week" }, NOW);
    expect(start).toEqual(expires);
    expect(end).toEqual(new Date(expires.getTime() + 7 * DAY));
  });

  it("starts an upgrade immediately", () => {
    const expires = new Date(NOW.getTime() + 5 * DAY);
    const { start } = nextPlanPeriod({ plan: "pro", planExpiresAt: expires }, { plan: "career", period: "quarter" }, NOW);
    expect(start).toEqual(NOW);
  });

  it("ignores an expired plan", () => {
    const { start } = nextPlanPeriod({ plan: "pro", planExpiresAt: new Date(NOW.getTime() - DAY) }, { plan: "pro", period: "month" }, NOW);
    expect(start).toEqual(NOW);
  });
});

describe("amountMatches", () => {
  it("accepts SantimPay's string amounts and a missing amount", () => {
    expect(amountMatches(129, "129")).toBe(true);
    expect(amountMatches(129, "129.00")).toBe(true);
    expect(amountMatches(129, 129)).toBe(true);
    expect(amountMatches(129, undefined)).toBe(true);
  });
  it("rejects a different amount", () => {
    expect(amountMatches(129, "1")).toBe(false);
  });
});

describe("classifyStatus", () => {
  it("maps SantimPay statuses", () => {
    expect(classifyStatus("COMPLETED")).toBe("paid");
    expect(classifyStatus("SUCCESS")).toBe("paid");
    expect(classifyStatus("FAILED")).toBe("failed");
    expect(classifyStatus("CANCELLED")).toBe("cancelled");
    expect(classifyStatus("PENDING")).toBe("pending");
    expect(classifyStatus(undefined)).toBe("pending");
  });
});

describe("SantimPayClient.sign", () => {
  it("produces an ES256 JWT whose payload is the JSON payload (as the SDK does)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "sec1", format: "pem" }).toString();
    const client = new SantimPayClient({ merchantId: "m-1", privateKey: pem, baseUrl: "https://example.invalid" });
    const payload = { amount: 129, paymentReason: "Ethio Jobs Pro (Month)", merchantId: "m-1", generated: 1_700_000_000 };
    const token = client.sign(payload);
    expect(jwt.decode(token, { complete: true })?.header.alg).toBe("ES256");
    const verified = jwt.verify(token, publicKey.export({ type: "spki", format: "pem" }).toString(), { algorithms: ["ES256"] });
    expect(typeof verified === "string" ? JSON.parse(verified) : verified).toEqual(payload);
  });
});
