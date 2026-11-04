import { describe, expect, it } from "vitest";
import { ConfigError, parseCliArgs } from "../../src/config/cli.js";
import { loadConfig, type ConfigDeps } from "../../src/config/loadConfig.js";

function makeDeps(files: Record<string, string>, readable: string[] = []): ConfigDeps {
  return {
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error("ENOENT");
      }
      return content;
    },
    canRead: (path) => readable.includes(path),
  };
}

const validConfig = JSON.stringify({
  defaultHost: "local",
  hosts: {
    local: { url: "unix:///var/run/docker.sock" },
    nas: { url: "ssh://user@nas.lan", readOnly: true },
  },
});

describe("parseCliArgs", () => {
  it("parses flags and both --config forms", () => {
    expect(parseCliArgs(["--read-only", "--no-redact", "--config", "a.json"])).toEqual({
      readOnly: true,
      redact: false,
      configPath: "a.json",
    });
    expect(parseCliArgs(["--config=b.json"]).configPath).toBe("b.json");
  });

  it("rejects unknown arguments and a missing path", () => {
    expect(() => parseCliArgs(["--nope"])).toThrow(ConfigError);
    expect(() => parseCliArgs(["--config"])).toThrow("requires a file path");
  });
});

describe("loadConfig", () => {
  it("falls back to the local socket without any config", () => {
    const config = loadConfig([], {}, makeDeps({}));
    expect(config.hosts).toEqual({ default: { url: "unix:///var/run/docker.sock", readOnly: false } });
    expect(config.redact).toBe(true);
    expect(config.readOnly).toBe(false);
  });

  it("builds the fallback host from DOCKER_HOST and DOCKER_CERT_PATH", () => {
    const config = loadConfig([], { DOCKER_HOST: "tcp://box:2376", DOCKER_CERT_PATH: "/certs" }, makeDeps({}));
    expect(config.hosts.default).toMatchObject({ url: "tcp://box:2376", ca: "/certs/ca.pem", key: "/certs/key.pem" });
  });

  it("treats an empty DOCKER_HOST as unset", () => {
    expect(loadConfig([], { DOCKER_HOST: "" }, makeDeps({})).hosts.default?.url).toBe("unix:///var/run/docker.sock");
  });

  it("loads a valid file through --config", () => {
    const config = loadConfig(["--config", "/etc/hosts.json", "--read-only"], {}, makeDeps({ "/etc/hosts.json": validConfig }));
    expect(Object.keys(config.hosts)).toEqual(["local", "nas"]);
    expect(config.hosts.nas?.readOnly).toBe(true);
    expect(config.hosts.local?.readOnly).toBe(false);
    expect(config.defaultHost).toBe("local");
    expect(config.readOnly).toBe(true);
  });

  it("gives --config precedence over MCP_DOCKER_CONFIG", () => {
    const deps = makeDeps({ "/flag.json": validConfig, "/env.json": "{}" });
    expect(loadConfig(["--config", "/flag.json"], { MCP_DOCKER_CONFIG: "/env.json" }, deps).defaultHost).toBe("local");
  });

  it("uses MCP_DOCKER_CONFIG when no flag is given", () => {
    const config = loadConfig([], { MCP_DOCKER_CONFIG: "/env.json" }, makeDeps({ "/env.json": validConfig }));
    expect(config.defaultHost).toBe("local");
  });

  it("resolves TLS paths relative to the config file", () => {
    const json = JSON.stringify({ hosts: { remote: { url: "tcp://box:2376", ca: "certs/ca.pem" } } });
    const config = loadConfig(["--config", "/etc/mcp/hosts.json"], {}, makeDeps({ "/etc/mcp/hosts.json": json }, ["/etc/mcp/certs/ca.pem"]));
    expect(config.hosts.remote?.ca).toBe("/etc/mcp/certs/ca.pem");
  });

  it.each([
    ["unreadable file", {}, "cannot read config file"],
    ["invalid JSON", { "/c.json": "{nope" }, "not valid JSON"],
    ["no hosts", { "/c.json": '{"hosts":{}}' }, "at least one host"],
    ["unknown defaultHost", { "/c.json": '{"defaultHost":"x","hosts":{"a":{"url":"unix:///s"}}}' }, "not a configured host"],
    ["password in URL", { "/c.json": '{"hosts":{"a":{"url":"ssh://u:pw@h"}}}' }, "must not embed a password"],
    ["bad scheme", { "/c.json": '{"hosts":{"a":{"url":"ftp://h"}}}' }, "unsupported scheme"],
    ["bad host name", { "/c.json": '{"hosts":{"a b":{"url":"unix:///s"}}}' }, "host names may only use"],
    ["unknown field", { "/c.json": '{"hosts":{"a":{"url":"unix:///s","pwd":"x"}}}' }, "pwd"],
    ["unreadable TLS file", { "/c.json": '{"hosts":{"a":{"url":"tcp://h:1","ca":"/nope.pem"}}}' }, "cannot read ca file"],
  ])("rejects %s", (_label, files, message) => {
    expect(() => loadConfig(["--config", "/c.json"], {}, makeDeps(files))).toThrow(message);
  });
});
