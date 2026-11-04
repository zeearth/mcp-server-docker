import { describe, expect, it } from "vitest";
import { describeDockerError } from "../../toolbox/errors.js";

describe("describeDockerError", () => {
  it("maps 404", () => {
    const message = describeDockerError({ statusCode: 404, json: { message: "No such container: web" } }, "nas");
    expect(message).toBe("[nas] Not found: No such container: web.");
  });

  it("maps 304 to an already-in-state message", () => {
    expect(describeDockerError({ statusCode: 304 })).toContain("already in the requested state");
  });

  it("maps 409 conflicts", () => {
    expect(describeDockerError({ statusCode: 409, json: { message: "container is paused" } })).toBe(
      "Conflict: container is paused.",
    );
  });

  it("maps permission errors", () => {
    expect(describeDockerError({ code: "EACCES" })).toContain("Permission denied");
  });

  it("maps an unreachable daemon", () => {
    expect(describeDockerError({ code: "ECONNREFUSED" })).toContain("Cannot reach the Docker daemon");
  });

  it("maps network failures", () => {
    expect(describeDockerError({ code: "ETIMEDOUT" })).toContain("Host unreachable");
  });

  it("maps SSH failures", () => {
    expect(describeDockerError(new Error("All configured authentication methods failed"))).toContain(
      "SSH authentication failed",
    );
    expect(describeDockerError(new Error("Host key verification failed."))).toContain("known_hosts");
    expect(describeDockerError(new Error("Host denied (verification failed)"))).toContain("known_hosts");
  });

  it("never leaks a stack trace", () => {
    const error = new Error("boom\n    at secret/path.js:1:1");
    expect(describeDockerError(error)).toBe("Docker error: boom.");
  });

  it("handles non-error values", () => {
    expect(describeDockerError("weird")).toBe("Docker error: weird.");
    expect(describeDockerError(undefined)).toBe("Docker error: undefined.");
  });
});

describe("describeDockerError (our own errors)", () => {
  it("returns the message of user-facing errors untouched", () => {
    const error = new Error('Host "nas" is read-only: docker_stop is not allowed.');
    error.name = "ReadOnlyError";
    expect(describeDockerError(error, "nas")).toBe('Host "nas" is read-only: docker_stop is not allowed.');
  });
});
