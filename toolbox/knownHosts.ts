import { createHmac } from "node:crypto";

/** One public key recorded for a host in a known_hosts file. */
export interface HostKeyEntry {
  type: string;
  keyBase64: string;
}

/**
 * Builds the name under which OpenSSH records a host: plain on port 22, "[host]:port" otherwise.
 * @param host Host name or address.
 * @param port SSH port.
 * @returns The known_hosts host token.
 */
function knownHostsToken(host: string, port: number): string {
  return port === 22 ? host : `[${host}]:${port}`;
}

/**
 * Tells whether a known_hosts host field designates the given token.
 * Handles comma-separated lists and hashed entries ("|1|salt|hash", HMAC-SHA1).
 * @param hostField First field of a known_hosts line.
 * @param token Host token to look for.
 * @returns True when the line applies to the host.
 */
function hostFieldMatches(hostField: string, token: string): boolean {
  if (hostField.startsWith("|1|")) {
    const [, , salt, hash] = hostField.split("|");
    if (!salt || !hash) {
      return false;
    }
    return createHmac("sha1", Buffer.from(salt, "base64")).update(token).digest("base64") === hash;
  }
  return hostField.split(",").includes(token);
}

/**
 * Extracts the keys a known_hosts file records for a host.
 * Revoked keys and certificate authorities are ignored: only plain trusted keys count.
 * @param content Text of a known_hosts file.
 * @param host Host name or address.
 * @param port SSH port.
 * @returns Every matching key (empty when the host is unknown).
 */
export function findHostKeys(content: string, host: string, port: number): HostKeyEntry[] {
  const token = knownHostsToken(host, port);
  const entries: HostKeyEntry[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("@")) {
      continue;
    }
    const [hostField, type, keyBase64] = line.split(/\s+/);
    if (hostField && type && keyBase64 && hostFieldMatches(hostField, token)) {
      entries.push({ type, keyBase64 });
    }
  }
  return entries;
}

/**
 * Lists the SSH host key algorithms to offer so the server presents a key we already trust.
 * An RSA key can be signed with several algorithms, so all of them are listed.
 * @param entries Keys returned by `findHostKeys`.
 * @returns Algorithm names, without duplicates.
 */
export function algorithmsFor(entries: readonly HostKeyEntry[]): string[] {
  const names = new Set<string>();
  for (const entry of entries) {
    if (entry.type === "ssh-rsa") {
      names.add("rsa-sha2-512");
      names.add("rsa-sha2-256");
    }
    names.add(entry.type);
  }
  return [...names];
}
