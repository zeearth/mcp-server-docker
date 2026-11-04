import { describe, expect, it } from "vitest";
import { REDACTED_VALUE, isSensitiveName, redactEnv } from "../../toolbox/redact.js";

describe("redactEnv", () => {
  it("masks sensitive values and keeps the others", () => {
    const result = redactEnv(["PATH=/usr/bin", "DB_PASSWORD=hunter2", "api_token=abc", "NODE_ENV=prod"]);
    expect(result).toEqual([
      "PATH=/usr/bin",
      `DB_PASSWORD=${REDACTED_VALUE}`,
      `api_token=${REDACTED_VALUE}`,
      "NODE_ENV=prod",
    ]);
  });

  it("keeps entries without a value", () => {
    expect(redactEnv(["SECRET_ONLY"])).toEqual(["SECRET_ONLY"]);
  });

  it("only looks at the name, not at the value", () => {
    expect(redactEnv(["GREETING=my password is nice"])).toEqual(["GREETING=my password is nice"]);
  });

  it("keeps '=' characters inside the value", () => {
    expect(redactEnv(["AUTH_KEY=a=b=c"])).toEqual([`AUTH_KEY=${REDACTED_VALUE}`]);
  });
});

describe("isSensitiveName", () => {
  it("detects the known patterns", () => {
    for (const name of ["API_KEY", "TOKEN", "MY_SECRET", "PASS", "AWS_CREDENTIALS"]) {
      expect(isSensitiveName(name)).toBe(true);
    }
    expect(isSensitiveName("HOSTNAME")).toBe(false);
  });
});
