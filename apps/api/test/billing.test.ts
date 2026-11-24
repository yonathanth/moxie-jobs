import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { amountMatches, nextPlanPeriod } from "../src/billing/billing.rules";
import { classifyStatus, normalizeStatus, SantimPayClient } from "../src/billing/santimpay.client";

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
    expect(amountMatches(129, "128.5")).toBe(false);
  });
  it("accepts a total that includes the customer fee", () => {
    expect(amountMatches(129, "131.58")).toBe(true);
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

describe("normalizeStatus", () => {
  it("reads the flat shape from the PDF", () => {
    expect(normalizeStatus({ status: "COMPLETED", message: "payment successful", santimPayTxnId: "t-1", id: "p-1", paymentMethod: "Telebirr" })).toEqual({
      status: "COMPLETED",
      message: "payment successful",
      santimPayTxnId: "t-1",
      id: "p-1",
      paymentMethod: "Telebirr",
      amount: undefined,
      currency: undefined,
    });
  });
  it("reads the fullParams shape (SDK 2.0: details under data)", () => {
    const s = normalizeStatus({ data: { Status: "COMPLETED", totalAmount: "201.99", amount: "199", currency: "ETB", txnId: "t-2", thirdPartyId: "p-2", paymentVia: "CBE Birr" } });
    expect(s).toMatchObject({ status: "COMPLETED", amount: 201.99, currency: "ETB", santimPayTxnId: "t-2", id: "p-2", paymentMethod: "CBE Birr" });
    expect(classifyStatus(s.status)).toBe("paid");
  });
  it("survives an empty response", () => {
    expect(classifyStatus(normalizeStatus(null).status)).toBe("pending");
  });
});

describe("SantimPayClient.verifyCallback", () => {
  const santim = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const santimPub = santim.publicKey.export({ type: "spki", format: "pem" }).toString();
  const ours = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "sec1", format: "pem" }).toString();
  const client = new SantimPayClient({ merchantId: "m-1", privateKey: ours, baseUrl: "https://example.invalid", publicKey: santimPub });
  const body = { txnId: "t-1", thirdPartyId: "8b0c6f0e-1d2a-4c3b-9e4f-5a6b7c8d9e0f", merId: "m-1", amount: "199", currency: "ETB", status: "COMPLETED" };
  const signWith = (key: string | import("node:crypto").KeyObject, payload: object, alg: jwt.Algorithm = "ES256") =>
    jwt.sign({ ...payload, iss: "santimpay" }, key, { algorithm: alg });

  it("accepts a genuine callback (header name in any case)", () => {
    const token = signWith(santim.privateKey, body);
    expect(client.verifyCallback({ "signed-token": token }, body)).toMatchObject(body);
    expect(client.verifyCallback({ "Signed-Token": token }, body)).toMatchObject(body);
  });
  it("rejects a missing header", () => {
    expect(() => client.verifyCallback({}, body)).toThrow(/missing/);
  });
  it("rejects a token signed by someone else", () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
    expect(() => client.verifyCallback({ "signed-token": signWith(other, body) }, body)).toThrow();
  });
  it("rejects HS256 tokens (key confusion)", () => {
    expect(() => client.verifyCallback({ "signed-token": signWith(santimPub, body, "HS256") }, body)).toThrow();
  });
  it("rejects a body edited after signing", () => {
    const token = signWith(santim.privateKey, body);
    expect(() => client.verifyCallback({ "signed-token": token }, { ...body, amount: "1" })).toThrow(/amount/);
  });
  it("rejects a callback for another merchant", () => {
    const other = { ...body, merId: "m-2" };
    expect(() => client.verifyCallback({ "signed-token": signWith(santim.privateKey, other) }, other)).toThrow(/merchant/);
  });
  it("uses SantimPay's built-in key by default", () => {
    const plain = new SantimPayClient({ merchantId: "m-1", privateKey: ours, baseUrl: "https://example.invalid" });
    expect(() => plain.verifyCallback({ "signed-token": signWith(santim.privateKey, body) }, body)).toThrow();
  });
});
