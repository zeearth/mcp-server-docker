import { describe, expect, it } from "vitest";
import { parseSince } from "../../toolbox/since.js";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

describe("parseSince", () => {
  it("converts relative durations", () => {
    const nowSeconds = NOW / 1000;
    expect(parseSince("30s", NOW)).toBe(nowSeconds - 30);
    expect(parseSince("10m", NOW)).toBe(nowSeconds - 600);
    expect(parseSince("2h", NOW)).toBe(nowSeconds - 7200);
    expect(parseSince("1d", NOW)).toBe(nowSeconds - 86400);
  });

  it("accepts ISO dates", () => {
    expect(parseSince("2026-01-01T00:00:00Z", NOW)).toBe(Date.UTC(2026, 0, 1) / 1000);
  });

  it("rejects garbage", () => {
    expect(() => parseSince("yesterday-ish", NOW)).toThrow('Invalid "since"');
  });
});
