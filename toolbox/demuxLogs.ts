export interface DemuxedLogs {
  stdout: string;
  stderr: string;
}

const HEADER_SIZE = 8;
const STREAM_STDERR = 2;

function looksMultiplexed(buffer: Buffer): boolean {
  if (buffer.length < HEADER_SIZE) {
    return false;
  }
  const type = buffer[0] ?? 0xff;
  return type <= STREAM_STDERR && buffer[1] === 0 && buffer[2] === 0 && buffer[3] === 0;
}

// Docker multiplexes stdout/stderr in 8-byte-header frames, except for TTY containers.
export function demuxLogs(buffer: Buffer, options: { tty?: boolean } = {}): DemuxedLogs {
  if (options.tty || !looksMultiplexed(buffer)) {
    return { stdout: buffer.toString("utf8"), stderr: "" };
  }
  const stdoutParts: Buffer[] = [];
  const stderrParts: Buffer[] = [];
  let offset = 0;
  while (offset + HEADER_SIZE <= buffer.length) {
    const type = buffer[offset] ?? 1;
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + HEADER_SIZE;
    // A truncated last frame keeps whatever bytes are available.
    const payload = buffer.subarray(start, Math.min(start + size, buffer.length));
    (type === STREAM_STDERR ? stderrParts : stdoutParts).push(payload);
    offset = start + size;
  }
  return {
    stdout: Buffer.concat(stdoutParts).toString("utf8"),
    stderr: Buffer.concat(stderrParts).toString("utf8"),
  };
}
