import { describe, expect, it } from "vitest";
import { search } from "../src/lib/search";

const items = [
  { id: "accountant", name: "Accountant", aliases: ["Accounts Officer", "አካውንታንት"] },
  { id: "junior_accountant", name: "Junior Accountant", aliases: ["Assistant Accountant"] },
  { id: "driver", name: "Driver", aliases: ["ሹፌር"] },
];

describe("search", () => {
  it("ranks exact and prefix matches first", () => {
    expect(search(items, "account").map((i) => i.id)).toEqual(["accountant", "junior_accountant"]);
  });

  it("matches word starts and aliases, including Amharic", () => {
    expect(search(items, "junior")[0].id).toBe("junior_accountant");
    expect(search(items, "ሹፌር")[0].id).toBe("driver");
  });

  it("returns nothing for an empty query", () => {
    expect(search(items, "  ")).toEqual([]);
  });
});
