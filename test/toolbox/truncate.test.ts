import { describe, expect, it } from "vitest";
import { truncateText, truncateWithMarker } from "../../toolbox/truncate.js";

describe("truncateText", () => {
  it("leaves short text untouched", () => {
    expect(truncateText("hello", { maxBytes: 100, maxLines: 10 })).toEqual({
      text: "hello",
      truncated: false,
      omittedBytes: 0,
    });
  });

  it("keeps the head by lines", () => {
    const result = truncateText("a\nb\nc\nd", { maxLines: 2 });
    expect(result.text).toBe("a\nb");
    expect(result.truncated).toBe(true);
  });

  it("keeps the tail by lines", () => {
    expect(truncateText("a\nb\nc\nd", { maxLines: 2, keep: "tail" }).text).toBe("c\nd");
  });

  it("cuts by bytes", () => {
    const result = truncateText("abcdefghij", { maxBytes: 4 });
    expect(result.text).toBe("abcd");
    expect(result.omittedBytes).toBe(6);
  });

  it("never splits a multi-byte character", () => {
    // "é" is 2 bytes: a limit of 3 must drop the half-cut character.
    expect(truncateText("aéé", { maxBytes: 3 }).text).toBe("aé");
    expect(truncateText("éécd", { maxBytes: 3, keep: "tail" }).text).toBe("cd");
  });

  it("handles empty input", () => {
    expect(truncateText("", { maxBytes: 5 }).truncated).toBe(false);
  });
});

describe("truncateWithMarker", () => {
  it("appends the marker after the head", () => {
    expect(truncateWithMarker("abcdef", { maxBytes: 3 })).toBe("abc\n[truncated: 3 bytes omitted]");
  });

  it("prepends the marker before the tail", () => {
    expect(truncateWithMarker("abcdef", { maxBytes: 3, keep: "tail" })).toBe(
      "[truncated: 3 bytes omitted]\ndef",
    );
  });

  it("adds no marker when nothing is cut", () => {
    expect(truncateWithMarker("abc", { maxBytes: 10 })).toBe("abc");
  });
});
