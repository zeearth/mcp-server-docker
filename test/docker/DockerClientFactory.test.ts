import { describe, expect, it } from "vitest";
import { buildDockerOptions, type FactoryDeps } from "../../src/docker/DockerClientFactory.js";

const deps: FactoryDeps = {
  readFile: (path) => Buffer.from(`content of ${path}`),
  env: { SSH_AUTH_SOCK: "/tmp/agent.sock" },
};

describe("buildDockerOptions", () => {
  it("uses the socket path for unix URLs", () => {
    expect(buildDockerOptions({ url: "unix:///var/run/docker.sock", readOnly: false }, deps)).toEqual({
      socketPath: "/var/run/docker.sock",
    });
  });

  it("tunnels ssh hosts through a custom agent on the default port", () => {
    const options = buildDockerOptions({ url: "ssh://bob@nas.lan", readOnly: false }, deps) as Record<string, unknown>;
    expect(options).toMatchObject({ protocol: "http", host: "nas.lan", port: 22 });
    expect(options.agent).toBeDefined();
  });

  it("honors an explicit ssh port", () => {
    expect(buildDockerOptions({ url: "ssh://bob@nas.lan:2222", readOnly: false }, deps)).toMatchObject({ port: 2222 });
  });

  it("uses plain http on 2375 for tcp URLs", () => {
    expect(buildDockerOptions({ url: "tcp://box", readOnly: false }, deps)).toEqual({
      protocol: "http",
      host: "box",
      port: 2375,
    });
  });

  it("switches to https and loads certificates when TLS files are set", () => {
    const options = buildDockerOptions({ url: "tcp://box", readOnly: false, ca: "/c/ca.pem", cert: "/c/cert.pem", key: "/c/key.pem" }, deps);
    expect(options.protocol).toBe("https");
    expect(options.port).toBe(2376);
    expect(options.ca?.toString()).toBe("content of /c/ca.pem");
    expect(options.key?.toString()).toBe("content of /c/key.pem");
  });
});
