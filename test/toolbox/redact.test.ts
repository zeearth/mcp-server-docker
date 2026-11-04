import { describe, expect, it } from "vitest";
import {
  REDACTED_VALUE,
  isSensitiveName,
  redactDeep,
  redactEnv,
  redactText,
  redactValue,
} from "../../toolbox/redact.js";

// Fake secrets shaped like the ones found in real containers.
const FAKE_BLOB = "A".repeat(40) + "b".repeat(40) + "C".repeat(60);

describe("redactEnv, by name", () => {
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

  it("keeps '=' characters inside a masked value", () => {
    expect(redactEnv(["AUTH_KEY=a=b=c"])).toEqual([`AUTH_KEY=${REDACTED_VALUE}`]);
  });

  it("also masks names such as service accounts and private material", () => {
    expect(redactEnv(["GCP_SERVICE_ACCOUNT_JSON=x", "SSL_PRIVATE_KEY=y", "SENTRY_DSN=z"])).toEqual([
      `GCP_SERVICE_ACCOUNT_JSON=${REDACTED_VALUE}`,
      `SSL_PRIVATE_KEY=${REDACTED_VALUE}`,
      `SENTRY_DSN=${REDACTED_VALUE}`,
    ]);
  });
});

describe("redactEnv, by value", () => {
  it("masks the password inside connection URLs whatever the variable is called", () => {
    const result = redactEnv([
      "DATABASE_URL=postgres://app:s3cr3tpw@db-host:5432/appdb",
      "REDIS_URL=redis://cache:an0therpw@redis:6379",
      "MONGO_URL=mongodb://kin_app:mongopw123@mongo:27017/kin?replicaSet=rs0&authSource=kin",
    ]);
    expect(result).toEqual([
      `DATABASE_URL=postgres://app:${REDACTED_VALUE}@db-host:5432/appdb`,
      `REDIS_URL=redis://cache:${REDACTED_VALUE}@redis:6379`,
      `MONGO_URL=mongodb://kin_app:${REDACTED_VALUE}@mongo:27017/kin?replicaSet=rs0&authSource=kin`,
    ]);
    expect(result.join("\n")).not.toMatch(/s3cr3tpw|an0therpw|mongopw123/);
  });

  it("masks URL passwords that contain spaces (app passwords)", () => {
    const [entry] = redactEnv(["MAIL_URL=smtp://user%40example.com:abcd efgh ijkl mnop@smtp.example.com:587"]);
    expect(entry).toBe(`MAIL_URL=smtp://user%40example.com:${REDACTED_VALUE}@smtp.example.com:587`);
  });

  it("masks long base64-like blobs", () => {
    expect(redactEnv([`SOME_CONFIG_BASE64=${FAKE_BLOB}`])).toEqual([`SOME_CONFIG_BASE64=${REDACTED_VALUE}`]);
  });

  it("masks private keys, JWTs and well-known token formats", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvg\n-----END PRIVATE KEY-----";
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk";
    const result = redactEnv([`CERT_DATA=${pem}`, `AUTH_HEADER=${jwt}`, "GH=ghp_abcdefghijklmnopqrstuvwxyz0123456789"]);
    expect(result.join("\n")).not.toMatch(/MIIEvg|eyJzdWIi|ghp_abcdef/);
  });

  it("leaves harmless values alone", () => {
    const harmless = [
      "PATH=/usr/local/bin:/usr/bin",
      "APP_URL=https://example.com/path",
      "ROOT_URL=https://app.example.com",
      "GREETING=my password is nice",
      "HOSTNAME=0.0.0.0",
      "GOOGLE_CLIENT_ID=123-abc.apps.googleusercontent.com",
    ];
    expect(redactEnv(harmless)).toEqual(harmless);
  });
});

describe("redactValue and redactText", () => {
  it("masks --password style arguments", () => {
    expect(redactValue("--password=hunter2")).toBe(`--password=${REDACTED_VALUE}`);
    expect(redactText("mysql -u root --password=hunter2 -h db")).toBe(`mysql -u root --password=${REDACTED_VALUE} -h db`);
  });

  it("masks credentials in log lines without eating the text around them", () => {
    const line = "connecting to postgres://app:s3cr3tpw@db:5432/app, then mail me@example.com";
    expect(redactText(line)).toBe(`connecting to postgres://app:${REDACTED_VALUE}@db:5432/app, then mail me@example.com`);
  });

  it("does not treat a host:port followed by an email as credentials", () => {
    const text = "see http://example.com:8080 and mail me@example.com";
    expect(redactText(text)).toBe(text);
  });
});

describe("redactDeep", () => {
  it("masks strings anywhere in a structure without mutating the input", () => {
    const input = { Config: { Cmd: ["run", "--token=abc123"], Labels: { dsn: "mysql://u:pw@h/db" } }, count: 3 };
    const output = redactDeep(input);
    expect(JSON.stringify(output)).not.toMatch(/abc123|:pw@/);
    expect(output.count).toBe(3);
    expect(input.Config.Cmd[1]).toBe("--token=abc123");
  });
});

describe("redactDeep on env-like strings", () => {
  it("masks the second copy of the environment found in HostConfig.Env", () => {
    const payload = {
      HostConfig: { Env: ["MAIL_URL=smtp://user%40example.com:abcd efgh ijkl mnop@smtp.example.com:587", "SMTP_PASSWORD=x"] },
    };
    const text = JSON.stringify(redactDeep(payload));
    expect(text).not.toMatch(/abcd efgh/);
    expect(text).toContain(`MAIL_URL=smtp://user%40example.com:${REDACTED_VALUE}@smtp.example.com:587`);
  });

  it("does not hide harmless boolean flags whose name contains PRIVATE", () => {
    expect(redactEnv(["STORAGE_ALLOW_PRIVATE_HOSTS=true"])).toEqual(["STORAGE_ALLOW_PRIVATE_HOSTS=true"]);
  });
});

describe("isSensitiveName", () => {
  it("detects the known patterns", () => {
    for (const name of ["API_KEY", "TOKEN", "MY_SECRET", "PASS", "AWS_CREDENTIALS", "SERVICE_ACCOUNT_JSON"]) {
      expect(isSensitiveName(name)).toBe(true);
    }
    expect(isSensitiveName("HOSTNAME")).toBe(false);
  });
});
