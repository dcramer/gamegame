import { describe, test, expect } from "vitest";
import { extractBGGId } from "@/lib/services/bgg";

describe("extractBGGId", () => {
  test("extracts ID from standard boardgame URL", () => {
    const url = "https://boardgamegeek.com/boardgame/224517/brass-birmingham";
    const result = extractBGGId(url);

    expect(result).toBe("224517");
  });

  test("extracts ID from boardgameexpansion URL", () => {
    const url = "https://boardgamegeek.com/boardgameexpansion/123456/some-expansion";
    const result = extractBGGId(url);

    expect(result).toBe("123456");
  });

  test("extracts ID from URL without name slug", () => {
    const url = "https://boardgamegeek.com/boardgame/224517";
    const result = extractBGGId(url);

    expect(result).toBe("224517");
  });

  test("extracts ID from URL with trailing slash", () => {
    const url = "https://boardgamegeek.com/boardgame/224517/";
    const result = extractBGGId(url);

    expect(result).toBe("224517");
  });

  test("extracts ID from URL with query parameters", () => {
    const url = "https://boardgamegeek.com/boardgame/224517/brass-birmingham?pageid=1";
    const result = extractBGGId(url);

    expect(result).toBe("224517");
  });

  test("returns null for invalid URL", () => {
    const url = "https://example.com/not-a-bgg-url";
    const result = extractBGGId(url);

    expect(result).toBeNull();
  });

  test("returns null for BGG URL without ID", () => {
    const url = "https://boardgamegeek.com/browse/boardgame";
    const result = extractBGGId(url);

    expect(result).toBeNull();
  });

  test("returns null for empty string", () => {
    const url = "";
    const result = extractBGGId(url);

    expect(result).toBeNull();
  });

  test("handles URL with multiple numbers (extracts game ID)", () => {
    const url = "https://boardgamegeek.com/boardgame/224517/brass-birmingham-2018";
    const result = extractBGGId(url);

    // Should extract the ID after /boardgame/, not the year in the name
    expect(result).toBe("224517");
  });

  test("handles http (not https)", () => {
    const url = "http://boardgamegeek.com/boardgame/174430/gloomhaven";
    const result = extractBGGId(url);

    expect(result).toBe("174430");
  });
});
