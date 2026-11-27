import { describe, expect, it } from "vitest";
import { dueSlot, pickPromo, type PromoInput } from "../src/delivery/promo";

const eat = (iso: string) => new Date(`${iso}+03:00`);
const now = eat("2026-11-25T19:05:00");
const base: PromoInput = {
  now,
  dayStart: eat("2026-11-25T00:00:00"),
  paid: false,
  lapsed: false,
  free: true,
  planEndsAt: null,
  premiumJobId: null,
  capWaiting: 0,
  freeCvsLeft: false,
  outOfCvs: false,
  recent: [],
};
const sent = (kind: string, iso: string, ref: string | null = null) => ({ kind, ref, sentAt: eat(iso) });

describe("dueSlot", () => {
  it("finds the latest slot that has started (within 3 hours)", () => {
    expect(dueSlot(eat("2026-11-25T12:40:00"), ["12:30", "19:00"])?.key).toBe("2026-11-25 12:30");
    expect(dueSlot(eat("2026-11-25T19:05:00"), ["12:30", "19:00"])?.key).toBe("2026-11-25 19:00");
    expect(dueSlot(eat("2026-11-25T12:00:00"), ["12:30", "19:00"])).toBeNull();
    expect(dueSlot(eat("2026-11-25T16:00:00"), ["12:30", "19:00"])).toBeNull();
  });
});

describe("pickPromo", () => {
  it("free: a premium match first, then the turns (no alert-limit picture: each held job gets a preview)", () => {
    expect(pickPromo({ ...base, premiumJobId: "j1", capWaiting: 3 })).toEqual({ kind: "premium", ref: "j1" });
    expect(pickPromo({ ...base, premiumJobId: "j1", capWaiting: 3, recent: [sent("premium", "2026-11-25T12:30:00", "j0")] })).toEqual({ kind: "upgrade" });
    expect(pickPromo({ ...base, capWaiting: 3, recent: [sent("cap", "2026-11-25T12:30:00")] })).toEqual({ kind: "upgrade" });
  });

  it("free: upgrade, CV and packs take turns, the one sent longest ago first", () => {
    expect(pickPromo({ ...base, freeCvsLeft: true })).toEqual({ kind: "upgrade" });
    expect(pickPromo({ ...base, freeCvsLeft: true, recent: [sent("upgrade", "2026-11-25T12:30:00")] })).toEqual({ kind: "cv" });
    expect(pickPromo({ ...base, freeCvsLeft: true, recent: [sent("cv", "2026-11-24T12:30:00")] })).toEqual({ kind: "upgrade" });
    expect(pickPromo({ ...base, outOfCvs: true, recent: [sent("upgrade", "2026-11-25T12:30:00")] })).toEqual({ kind: "packs" });
    expect(pickPromo({ ...base, freeCvsLeft: true, recent: [sent("upgrade", "2026-11-25T12:30:00"), sent("cv", "2026-11-24T19:00:00")] })).toBeNull();
  });

  it("paid: only a renewal reminder (once per plan end) and packs when out of CVs", () => {
    const ends = eat("2026-11-27T10:00:00");
    const paid = { ...base, free: false, paid: true, planEndsAt: ends };
    expect(pickPromo(paid)).toEqual({ kind: "renew_soon", ref: ends.toISOString() });
    expect(pickPromo({ ...paid, recent: [sent("renew_soon", "2026-11-25T12:30:00", ends.toISOString())] })).toBeNull();
    expect(pickPromo({ ...paid, planEndsAt: eat("2026-12-20T10:00:00"), outOfCvs: true })).toEqual({ kind: "packs" });
    expect(pickPromo({ ...paid, planEndsAt: eat("2026-12-20T10:00:00"), premiumJobId: "j1", capWaiting: 4 })).toBeNull();
  });

  it("a plan that just ended gets one 'has ended' message, then the free turns", () => {
    const ended = eat("2026-11-24T10:00:00");
    const lapsed = { ...base, lapsed: true, planEndsAt: ended };
    expect(pickPromo(lapsed)).toEqual({ kind: "renew_lapsed", ref: ended.toISOString() });
    expect(pickPromo({ ...lapsed, recent: [sent("renew_lapsed", "2026-11-25T12:30:00", ended.toISOString())] })).toEqual({ kind: "upgrade" });
  });
});
