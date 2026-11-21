import { describe, expect, it } from "vitest";
import { channelHandle } from "../src/components/admin/channel";

describe("channelHandle", () => {
  it("accepts every common way of writing a channel", () => {
    for (const input of ["@kirajobs", "kirajobs", "t.me/kirajobs", "https://t.me/kirajobs", "https://t.me/kirajobs/1234?single", " telegram.me/kirajobs "]) {
      expect(channelHandle(input), input).toBe("kirajobs");
    }
  });
});
