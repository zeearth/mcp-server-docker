import { describe, expect, it } from "vitest";
import { demuxLogs } from "../../toolbox/demuxLogs.js";

function frame(type: number, text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe("demuxLogs", () => {
  it("splits stdout and stderr frames", () => {
    const buffer = Buffer.concat([frame(1, "out1\n"), frame(2, "err1\n"), frame(1, "out2\n")]);
    expect(demuxLogs(buffer)).toEqual({ stdout: "out1\nout2\n", stderr: "err1\n" });
  });

  it("returns empty output for an empty buffer", () => {
    expect(demuxLogs(Buffer.alloc(0))).toEqual({ stdout: "", stderr: "" });
  });

  it("treats TTY output as raw stdout", () => {
    expect(demuxLogs(Buffer.from("raw text"), { tty: true })).toEqual({ stdout: "raw text", stderr: "" });
  });

  it("falls back to raw text when the stream is not multiplexed", () => {
    expect(demuxLogs(Buffer.from("plain log line\n"))).toEqual({ stdout: "plain log line\n", stderr: "" });
  });

  it("keeps the available bytes of a truncated last frame", () => {
    const full = frame(1, "hello world");
    expect(demuxLogs(full.subarray(0, full.length - 6)).stdout).toBe("hello");
  });

  it("supports multi-byte characters inside a frame", () => {
    expect(demuxLogs(frame(1, "café\n")).stdout).toBe("café\n");
  });
});
