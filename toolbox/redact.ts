export const REDACTED_VALUE = "***REDACTED***";

// Names that usually hold a secret. Matching on the name alone is not enough: see the value rules below.
const SENSITIVE_NAME =
  /KEY|TOKEN|PASSWORD|PASSWD|SECRET|PASS|CREDENTIAL|SERVICE_ACCOUNT|DSN|COOKIE|SALT|SIGNING|BEARER|JWT/i;

const PEM_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const KNOWN_TOKENS =
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g;
// "password=...", "--token=...", "?api_key=..." in URLs, command lines and logs.
const KEY_VALUE_SECRET = /(\b(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|access[_-]?token|auth)=)([^&\s;"']+)/gi;
// scheme://user:password@host. In free text a password cannot contain spaces.
const URL_PASSWORD_TEXT = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s@:]*:)([^/\s]*)@/g;
// When the whole value is a URL, the password may contain spaces (e.g. app passwords).
const URL_PASSWORD_VALUE = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s@:]*:)([^/]*)@/g;
const URL_START = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
// Long unbroken base64-like strings are almost always encoded keys or certificates.
const LONG_BLOB = /^[A-Za-z0-9+/=_-]{120,}$/;
// An environment entry "NAME=value", as found in Config.Env and also in HostConfig.Env.
const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;

/**
 * Tells whether a variable name suggests a secret.
 * @param name Environment variable name.
 * @returns True for names such as API_KEY, DB_PASSWORD or SERVICE_ACCOUNT_JSON.
 */
export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

/**
 * Masks secrets inside free text such as logs: URL passwords, private keys, JWTs, well-known
 * token formats and "password=..." pairs. Surrounding text is kept so the output stays readable.
 * @param text Any text.
 * @returns The text with secrets replaced by a marker.
 */
export function redactText(text: string): string {
  return text
    .replace(PEM_BLOCK, REDACTED_VALUE)
    .replace(JWT, REDACTED_VALUE)
    .replace(KNOWN_TOKENS, REDACTED_VALUE)
    .replace(URL_PASSWORD_TEXT, `$1${REDACTED_VALUE}@`)
    .replace(KEY_VALUE_SECRET, `$1${REDACTED_VALUE}`);
}

/**
 * Masks secrets in a single value (an environment entry, a command argument, a label).
 * Same rules as `redactText`, plus: a "NAME=value" entry is treated like an environment variable,
 * a value that is a URL may have spaces in its password, and a long base64-like blob is masked entirely.
 * @param value The whole value.
 * @returns The value with secrets replaced by a marker.
 */
export function redactValue(value: string): string {
  const assignment = ENV_ASSIGNMENT.exec(value);
  if (assignment) {
    const [, name = "", rest = ""] = assignment;
    return isSensitiveName(name) ? `${name}=${REDACTED_VALUE}` : `${name}=${redactValue(rest)}`;
  }
  if (LONG_BLOB.test(value)) {
    return REDACTED_VALUE;
  }
  const withoutUrlPassword = URL_START.test(value) ? value.replace(URL_PASSWORD_VALUE, `$1${REDACTED_VALUE}@`) : value;
  return redactText(withoutUrlPassword);
}

/**
 * Masks Docker environment entries ("NAME=value"). A sensitive name hides the whole value;
 * otherwise the value is still scanned for embedded secrets (e.g. a DATABASE_URL with a password).
 * Entries without "=" are kept as is.
 * @param entries Environment entries.
 * @returns A new list of entries.
 */
export function redactEnv(entries: readonly string[]): string[] {
  return entries.map((entry) => (entry.includes("=") ? redactValue(entry) : entry));
}

/**
 * Applies `redactValue` to every string found in an object tree, without mutating the input.
 * Used on a full inspect payload, where secrets can hide in the command, labels or arguments.
 * @param input Any JSON-like value.
 * @returns A copy with secrets masked.
 */
export function redactDeep<T>(input: T): T {
  if (typeof input === "string") {
    return redactValue(input) as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactDeep(item)) as T;
  }
  if (input !== null && typeof input === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      copy[key] = redactDeep(value);
    }
    return copy as T;
  }
  return input;
}
