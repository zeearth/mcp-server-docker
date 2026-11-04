export const REDACTED_VALUE = "***REDACTED***";

const SENSITIVE_NAME = /KEY|TOKEN|PASSWORD|SECRET|PASS|CREDENTIAL/i;

export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

// Docker env entries look like "NAME=value"; entries without "=" are kept as is.
export function redactEnv(entries: readonly string[]): string[] {
  return entries.map((entry) => {
    const separator = entry.indexOf("=");
    if (separator === -1) {
      return entry;
    }
    const name = entry.slice(0, separator);
    return isSensitiveName(name) ? `${name}=${REDACTED_VALUE}` : entry;
  });
}
