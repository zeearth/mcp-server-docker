/** Raised when a write operation is attempted on a read-only host. */
export class ReadOnlyError extends Error {
  /**
   * @param hostName Name of the host that refused the operation.
   * @param action Name of the refused operation (e.g. "docker_stop").
   */
  constructor(hostName: string, action: string) {
    super(`Host "${hostName}" is read-only: ${action} is not allowed.`);
    this.name = "ReadOnlyError";
  }
}

/** Raised when a tool references a host name that is not configured. */
export class UnknownHostError extends Error {
  /**
   * @param hostName The unknown name.
   * @param known Configured host names, listed in the message.
   */
  constructor(hostName: string, known: readonly string[]) {
    super(`Unknown host "${hostName}". Configured hosts: ${known.join(", ")}.`);
    this.name = "UnknownHostError";
  }
}

/** Raised when no host can be chosen safely from the tool input. */
export class HostSelectionError extends Error {
  /**
   * @param message Explanation of why the host could not be selected.
   */
  constructor(message: string) {
    super(message);
    this.name = "HostSelectionError";
  }
}
