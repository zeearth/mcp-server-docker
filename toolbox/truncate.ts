export interface TruncateOptions {
  maxBytes?: number;
  maxLines?: number;
  // Logs are most useful at the end, other output at the start.
  keep?: "head" | "tail";
}

export interface TruncateResult {
  text: string;
  truncated: boolean;
  omittedBytes: number;
}

const CONTINUATION_MASK = 0xc0;
const CONTINUATION_BITS = 0x80;

function isContinuationByte(byte: number | undefined): boolean {
  return byte !== undefined && (byte & CONTINUATION_MASK) === CONTINUATION_BITS;
}

function limitLines(text: string, maxLines: number, keep: "head" | "tail"): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) {
    return text;
  }
  return keep === "head" ? lines.slice(0, maxLines).join("\n") : lines.slice(-maxLines).join("\n");
}

function limitBytes(text: string, maxBytes: number, keep: "head" | "tail"): string {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= maxBytes) {
    return text;
  }
  if (keep === "head") {
    let end = maxBytes;
    // Never cut inside a multi-byte character.
    while (end > 0 && isContinuationByte(buffer[end])) {
      end -= 1;
    }
    return buffer.subarray(0, end).toString("utf8");
  }
  let start = buffer.length - maxBytes;
  while (start < buffer.length && isContinuationByte(buffer[start])) {
    start += 1;
  }
  return buffer.subarray(start).toString("utf8");
}

export function truncateText(input: string, options: TruncateOptions = {}): TruncateResult {
  const keep = options.keep ?? "head";
  let output = input;
  if (options.maxLines !== undefined) {
    output = limitLines(output, options.maxLines, keep);
  }
  if (options.maxBytes !== undefined) {
    output = limitBytes(output, options.maxBytes, keep);
  }
  const omittedBytes = Buffer.byteLength(input, "utf8") - Buffer.byteLength(output, "utf8");
  return { text: output, truncated: omittedBytes > 0, omittedBytes };
}

// Adds an explicit marker so the model knows data is missing.
export function truncateWithMarker(input: string, options: TruncateOptions = {}): string {
  const result = truncateText(input, options);
  if (!result.truncated) {
    return result.text;
  }
  const marker = `[truncated: ${result.omittedBytes} bytes omitted]`;
  return (options.keep ?? "head") === "head" ? `${result.text}\n${marker}` : `${marker}\n${result.text}`;
}
