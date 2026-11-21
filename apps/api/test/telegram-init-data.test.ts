import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InitDataError, verifyInitData } from "../src/auth/telegram-init-data";

const BOT_TOKEN = "123456:TEST-token-abcdefghijklmnopqrstuvwxyz";
const NOW = new Date("2026-11-17T10:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);

/** Builds initData the way Telegram does, signed with `token`. */
function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 42, first_name: "Abebe", username: "abebe" });

describe("verifyInitData", () => {
  it("accepts correctly signed data and returns the user", () => {
    const data = sign({ auth_date: String(nowSec - 60), query_id: "AAE", user, start_param: "ref_x" });
    const result = verifyInitData(data, BOT_TOKEN, 86400, NOW);
    expect(result.user.id).toBe(42);
    expect(result.user.first_name).toBe("Abebe");
    expect(result.startParam).toBe("ref_x");
  });

  it("rejects data signed with another bot's token", () => {
    const data = sign({ auth_date: String(nowSec), user }, "999:other-token-abcdefghijklmnopqrstuvwxyz");
    expect(() => verifyInitData(data, BOT_TOKEN, 86400, NOW)).toThrow(InitDataError);
  });

  it("rejects tampered fields", () => {
    const data = sign({ auth_date: String(nowSec), user }).replace("Abebe", "Mallory");
    expect(() => verifyInitData(data, BOT_TOKEN, 86400, NOW)).toThrow(/signature/);
  });

  it("rejects expired data", () => {
    const data = sign({ auth_date: String(nowSec - 90_000), user });
    expect(() => verifyInitData(data, BOT_TOKEN, 86400, NOW)).toThrow(/expired/);
  });

  it("rejects a missing or malformed hash", () => {
    expect(() => verifyInitData("auth_date=1&user=%7B%7D", BOT_TOKEN, 86400, NOW)).toThrow(/hash/);
    expect(() => verifyInitData("hash=zz", BOT_TOKEN, 86400, NOW)).toThrow(/hash/);
  });

  it("rejects missing user", () => {
    const data = sign({ auth_date: String(nowSec) });
    expect(() => verifyInitData(data, BOT_TOKEN, 86400, NOW)).toThrow(/user/);
  });
});
