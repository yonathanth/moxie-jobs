import { describe, expect, it } from "vitest";
import { messageButtons, messageLinks } from "../src/telegram/message";

const text = "Accountant at ABC. Details: effoysira.com/abc-vacancy and more";

describe("telegram message parsing", () => {
  it("collects text links and bare urls", () => {
    const links = messageLinks({
      id: 1,
      date: 0,
      message: text,
      entities: [
        { className: "MessageEntityTextUrl", offset: 0, length: 10, url: "https://hahu.jobs/jobs/x1" },
        { className: "MessageEntityUrl", offset: text.indexOf("effoysira"), length: "effoysira.com/abc-vacancy".length },
        { className: "MessageEntityBold", offset: 0, length: 3 },
      ],
    });
    expect(links).toEqual(["https://hahu.jobs/jobs/x1", "https://effoysira.com/abc-vacancy"]);
  });

  it("collects inline keyboard url / mini app buttons", () => {
    const buttons = messageButtons({
      id: 1,
      date: 0,
      replyMarkup: {
        className: "ReplyInlineMarkup",
        rows: [
          { buttons: [{ className: "KeyboardButtonUrl", text: "Apply Now", url: "http://t.me/ethiojobs_netbot?startapp=job_id_1" }] },
          { buttons: [{ className: "KeyboardButtonCallback", text: "Like" }] },
        ],
      },
    });
    expect(buttons).toEqual([{ text: "Apply Now", url: "http://t.me/ethiojobs_netbot?startapp=job_id_1" }]);
  });

  it("ignores reply keyboards", () => {
    expect(messageButtons({ id: 1, date: 0, replyMarkup: { className: "ReplyKeyboardMarkup" } })).toEqual([]);
  });
});
