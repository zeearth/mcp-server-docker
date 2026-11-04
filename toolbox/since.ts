const RELATIVE_PATTERN = /^(\d+)([smhd])$/;
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/**
 * Converts a "since" expression into a Unix timestamp in seconds, as expected by the Docker API.
 * @param input Relative duration ("30s", "10m", "2h", "1d") or an ISO 8601 date.
 * @param nowMs Current time in milliseconds, injectable for tests.
 * @returns Unix timestamp in seconds.
 * @throws Error when the expression is neither a duration nor a valid date.
 */
export function parseSince(input: string, nowMs: number = Date.now()): number {
  const trimmed = input.trim();
  const relative = RELATIVE_PATTERN.exec(trimmed);
  if (relative) {
    const amount = Number(relative[1]);
    const unitSeconds = UNIT_SECONDS[relative[2] as string] as number;
    return Math.floor(nowMs / 1000) - amount * unitSeconds;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    const error = new Error(`Invalid "since" value "${input}": use a duration like 10m, 2h, 1d or an ISO date.`);
    error.name = "InvalidInputError";
    throw error;
  }
  return Math.floor(parsed / 1000);
}
