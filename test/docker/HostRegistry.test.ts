import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/config/schema.js";
import type { DockerApi } from "../../src/docker/DockerService.js";
import { HostRegistry } from "../../src/docker/HostRegistry.js";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    hosts: {
      local: { url: "unix:///var/run/docker.sock", readOnly: false },
      nas: { url: "ssh://bob@nas.lan", readOnly: true },
    },
    defaultHost: "local",
    readOnly: false,
    redact: true,
    ...overrides,
  };
}

const fakeClient = () => ({}) as DockerApi;

describe("HostRegistry", () => {
  it("combines the global and per-host read-only flags", () => {
    expect(new HostRegistry(makeConfig(), fakeClient).isReadOnly("nas")).toBe(true);
    expect(new HostRegistry(makeConfig(), fakeClient).isReadOnly("local")).toBe(false);
    expect(new HostRegistry(makeConfig({ readOnly: true }), fakeClient).isReadOnly("local")).toBe(true);
  });

  it("knows whether any host is writable", () => {
    expect(new HostRegistry(makeConfig(), fakeClient).hasWritableHost()).toBe(true);
    expect(new HostRegistry(makeConfig({ readOnly: true }), fakeClient).hasWritableHost()).toBe(false);
  });

  it("lists hosts without creating any client", () => {
    const factory = vi.fn(fakeClient);
    const hosts = new HostRegistry(makeConfig(), factory).listHosts();
    expect(hosts).toEqual([
      { name: "local", url: "unix:///var/run/docker.sock", readOnly: false, isDefault: true },
      { name: "nas", url: "ssh://bob@nas.lan", readOnly: true, isDefault: false },
    ]);
    expect(factory).not.toHaveBeenCalled();
  });

  it("creates services lazily, once per host", () => {
    const factory = vi.fn(fakeClient);
    const registry = new HostRegistry(makeConfig(), factory);
    const first = registry.getService("nas");
    expect(registry.getService("nas")).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown hosts and lists the valid ones", () => {
    const registry = new HostRegistry(makeConfig(), fakeClient);
    expect(() => registry.getService("nope")).toThrow("Configured hosts: local, nas");
    expect(() => registry.resolveHostName("nope", false)).toThrow("Unknown host");
  });

  it("tells when the host parameter can be omitted", () => {
    const registry = new HostRegistry(makeConfig(), fakeClient);
    expect(registry.isHostOptional(false)).toBe(true);
    expect(registry.isHostOptional(true)).toBe(false);
    const single = makeConfig({ hosts: { only: { url: "unix:///s", readOnly: false } }, defaultHost: undefined });
    expect(new HostRegistry(single, fakeClient).isHostOptional(true)).toBe(true);
    expect(new HostRegistry(makeConfig({ defaultHost: undefined }), fakeClient).isHostOptional(false)).toBe(false);
  });

  describe("resolveHostName", () => {
    it("honors an explicit name", () => {
      expect(new HostRegistry(makeConfig(), fakeClient).resolveHostName("nas", true)).toBe("nas");
    });

    it("uses the only host when there is a single one, even for writes", () => {
      const single = makeConfig({ hosts: { only: { url: "unix:///s", readOnly: false } }, defaultHost: undefined });
      expect(new HostRegistry(single, fakeClient).resolveHostName(undefined, true)).toBe("only");
    });

    it("uses defaultHost for reads but never for writes", () => {
      const registry = new HostRegistry(makeConfig(), fakeClient);
      expect(registry.resolveHostName(undefined, false)).toBe("local");
      expect(() => registry.resolveHostName(undefined, true)).toThrow("explicit host");
    });

    it("requires a host when there is no default", () => {
      const registry = new HostRegistry(makeConfig({ defaultHost: undefined }), fakeClient);
      expect(() => registry.resolveHostName(undefined, false)).toThrow("A host is required");
    });
  });
});
