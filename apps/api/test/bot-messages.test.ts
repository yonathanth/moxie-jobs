import { describe, expect, it } from "vitest";
import { escapeHtml, welcomeNew, webAppButton } from "../src/bot/bot.messages";

describe("bot messages", () => {
  it("escapes user names in HTML replies", () => {
    expect(welcomeNew("<b>x</b>", "https://job.gomoxie.app").text).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("only makes Mini App buttons for https URLs", () => {
    expect(webAppButton("Go", "http://localhost:3000", "/app")).toBeNull();
    expect(webAppButton("Go", "https://job.gomoxie.app", "/app")).toEqual({
      text: "Go",
      web_app: { url: "https://job.gomoxie.app/app" },
    });
    expect(welcomeNew(null, "https://job.gomoxie.app").reply_markup?.inline_keyboard[0][0]).toMatchObject({
      web_app: { url: "https://job.gomoxie.app/app/onboarding" },
    });
  });
});
