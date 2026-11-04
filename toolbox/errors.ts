interface ErrorLike {
  statusCode?: number;
  code?: string;
  message?: string;
  reason?: string;
  json?: { message?: string };
}

// Errors raised by our own code whose message is already meant for the user.
const USER_FACING_ERROR_NAMES = new Set(["ReadOnlyError", "UnknownHostError", "HostSelectionError", "InvalidInputError"]);

function firstLine(text: string): string {
  return (text.split("\n")[0] ?? "").trim();
}

// Turns raw Docker/transport errors into short actionable messages, never a stack trace.
export function describeDockerError(error: unknown, hostName?: string): string {
  if (error instanceof Error && USER_FACING_ERROR_NAMES.has(error.name)) {
    return error.message;
  }
  const prefix = hostName ? `[${hostName}] ` : "";
  const err = (typeof error === "object" && error !== null ? error : {}) as ErrorLike;
  const raw = err.json?.message ?? err.reason ?? err.message ?? String(error);
  const detail = firstLine(raw);

  if (err.statusCode === 404) {
    return `${prefix}Not found: ${detail || "no such object"}.`;
  }
  if (err.statusCode === 304) {
    return `${prefix}Nothing to do: the container is already in the requested state.`;
  }
  if (err.statusCode === 409) {
    return `${prefix}Conflict: ${detail}.`;
  }
  if (err.statusCode === 403 || err.code === "EACCES") {
    return `${prefix}Permission denied by the Docker daemon or socket. Check that the user can access it.`;
  }
  if (err.code === "ENOENT" || err.code === "ECONNREFUSED") {
    return `${prefix}Cannot reach the Docker daemon (${err.code}). Is Docker running and the URL correct?`;
  }
  if (err.code === "ETIMEDOUT" || err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH") {
    return `${prefix}Host unreachable (${err.code}). Check the network and the host name.`;
  }
  if (/authentication methods failed|permission denied \(publickey/i.test(raw)) {
    return `${prefix}SSH authentication failed. Check the key, the ssh-agent and the user in the host URL.`;
  }
  if (/host key verification failed|host denied/i.test(raw)) {
    return `${prefix}SSH host key verification failed. Connect once with the ssh command to record the host in known_hosts.`;
  }
  if (err.statusCode !== undefined) {
    return `${prefix}Docker error ${err.statusCode}: ${detail}.`;
  }
  return `${prefix}Docker error: ${detail || "unknown error"}.`;
}
