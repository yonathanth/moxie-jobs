import { describe, expect, it } from "vitest";
import { activeFilterCount, feedStateToParams, parseFeedState, toQuery } from "../src/components/jobs/filters";
import { feedParams } from "../src/lib/api";

describe("feed state in the URL", () => {
  it("round-trips every filter", () => {
    const url = "scope=all&q=accountant&cities=addis_ababa%2Cadama&types=contract&employers=ngo%2Cinternational&remote=1&posted=7d&closing=1&salary=1&similar=0a2188b4-a7a6-48b7-a426-77f0db9c5883";
    const state = parseFeedState(new URLSearchParams(url));
    expect(state).toEqual({
      scope: "all",
      q: "accountant",
      cities: ["addis_ababa", "adama"],
      types: ["contract"],
      employers: ["ngo", "international"],
      remote: true,
      posted: "7d",
      closing: true,
      salary: true,
      similar: "0a2188b4-a7a6-48b7-a426-77f0db9c5883",
    });
    expect(parseFeedState(new URLSearchParams(feedStateToParams(state)))).toEqual(state);
    expect(activeFilterCount(state)).toBe(9);
  });

  it("defaults to For you with nothing set, and drops unknown values", () => {
    const state = parseFeedState(new URLSearchParams("scope=bogus&cities=atlantis,adama&posted=99d&employers=pirates"));
    expect(state).toMatchObject({ scope: "for_you", cities: ["adama"], posted: null, employers: [], similar: null });
    expect(feedStateToParams({ ...state, cities: [] })).toBe("");
  });

  it("builds the API query string", () => {
    const state = parseFeedState(new URLSearchParams("q=  nurse &remote=1"));
    expect(feedParams({ ...toQuery(state), cursor: "abc", limit: 20 })).toBe("scope=for_you&q=nurse&remote=1&cursor=abc&limit=20");
  });
});
