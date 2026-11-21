import { describe, expect, it } from "vitest";
import { reviewReasons, settingsUpdateSchema, sourceCreateSchema, sourceIdFromHandle } from "../src/admin/admin.rules";

describe("reviewReasons", () => {
  it("explains why a job was held", () => {
    expect(reviewReasons({ qualityFlags: ["fee_required"], professionId: "x", functionId: "y" })).toEqual(["Asks applicants to pay"]);
    expect(reviewReasons({ qualityFlags: ["suspicious"], professionId: null, functionId: null })).toEqual(["Looks suspicious", "Couldn't classify"]);
    expect(reviewReasons({ qualityFlags: [], professionId: "x", functionId: null })).toEqual(["Held for review"]);
  });
});

describe("sources", () => {
  it("turns a handle into a stable id", () => {
    expect(sourceIdFromHandle("@Ethio_Jobs")).toBe("ethio_jobs");
    expect(sourceIdFromHandle("WorkLinkETH")).toBe("worklinketh");
  });
  it("accepts channel handles only", () => {
    expect(sourceCreateSchema.safeParse({ handle: "@kirajobs" }).success).toBe(true);
    expect(sourceCreateSchema.safeParse({ handle: "https://t.me/kirajobs" }).success).toBe(false);
    expect(sourceCreateSchema.safeParse({ handle: "ab" }).success).toBe(false);
  });
});

describe("settings update", () => {
  it("accepts partial updates and full plan limits", () => {
    expect(settingsUpdateSchema.safeParse({ betaAllPro: false }).success).toBe(true);
    const limits = { maxProfessions: 5, maxFunctions: 3, maxFieldsOfStudy: 5, maxLocations: 10, dailyJobCap: null, premiumJobs: true, cvNewPerMonth: 2, cvTailorPerMonth: null };
    expect(
      settingsUpdateSchema.safeParse({ planLimits: { free: { ...limits, maxFunctions: 0, dailyJobCap: 10, premiumJobs: false }, pro: limits, career: limits } }).success,
    ).toBe(true);
  });
  it("rejects bad values and unknown keys", () => {
    expect(settingsUpdateSchema.safeParse({ prices: { pro: { week: 0, month: 129, quarter: 329 }, career: { week: 99, month: 349, quarter: 899 } } }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ unpaidJobs: "hide" }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ hacker: true }).success).toBe(false);
  });
});

import { usersWhere } from "../src/admin/admin-users.service";

describe("users filters", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  it("no filters = everyone", () => {
    expect(usersWhere({ plan: "all", status: "all" }, now)).toEqual({});
  });
  it("plan filters distinguish active, expired and free", () => {
    expect(JSON.stringify(usersWhere({ plan: "pro", status: "all" }, now))).toContain('"plan":"pro"');
    expect(JSON.stringify(usersWhere({ plan: "expired", status: "all" }, now))).toContain('"lte":"2026-11-21T12:00:00.000Z"');
    expect(JSON.stringify(usersWhere({ plan: "free", status: "all" }, now))).toContain('"NOT"');
  });
  it("search matches names, @username and Telegram id", () => {
    const w = JSON.stringify(usersWhere({ plan: "all", status: "all", q: "@abebe" }, now));
    expect(w).toContain('"contains":"abebe"');
    const byId = usersWhere({ plan: "all", status: "all", q: "894105818" }, now) as { AND: { OR: unknown[] }[] };
    expect(byId.AND[0]!.OR).toContainEqual({ telegramId: BigInt(894105818) });
  });
  it("status and joined filters", () => {
    const w = JSON.stringify(usersWhere({ plan: "all", status: "not_set_up", joined: "7d" }, now));
    expect(w).toContain('"onboardedAt":null');
    expect(w).toContain('"createdAt"');
  });
});

import { adminLabel } from "../src/admin/admin-users.service";

describe("adminLabel", () => {
  it("names the admin in a user's plan history", () => {
    expect(adminLabel({ firstName: "Yonathan", username: "yoni", telegramId: BigInt(1) })).toBe("Yonathan (@yoni)");
    expect(adminLabel({ firstName: null, username: null, telegramId: BigInt(42) })).toBe("Telegram 42");
  });
});
