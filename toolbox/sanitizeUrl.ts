/**
 * Removes the password from a host URL so it is safe to display.
 * The user name is kept: it is not a secret and tells which account is used.
 * @param url Host URL from the configuration.
 * @returns The URL without password, or "(invalid url)" when it cannot be parsed.
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "";
    return parsed.toString();
  } catch {
    return "(invalid url)";
  }
}
