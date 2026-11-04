import { describe, expect, it, vi } from "vitest";
import { DockerService, type DockerApi } from "../../src/docker/DockerService.js";
import { ReadOnlyError } from "../../src/docker/errors.js";

function frame(type: number, text: string): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

const inspectInfo = {
  Id: "abcdef1234567890",
  Name: "/web",
  Created: "2026-01-01T00:00:00Z",
  RestartCount: 1,
  State: { Status: "running", Running: true, ExitCode: 0, StartedAt: "s", FinishedAt: "f", Health: { Status: "healthy" } },
  HostConfig: { RestartPolicy: { Name: "always" } },
  Config: { Image: "nginx", Tty: false, Env: ["PATH=/bin", "DB_PASSWORD=hunter2"], Cmd: ["nginx"], Entrypoint: null, Labels: {} },
  NetworkSettings: {
    Ports: { "80/tcp": [{ HostIp: "", HostPort: "8080" }], "443/tcp": null },
    Networks: { bridge: { IPAddress: "172.17.0.2" } },
  },
  Mounts: [{ Type: "bind", Source: "/data", Destination: "/d", RW: false }],
};

function makeService(container: Record<string, unknown>, options = { readOnly: false, redact: true }) {
  const docker = {
    listContainers: vi.fn().mockResolvedValue([]),
    getContainer: vi.fn().mockReturnValue(container),
  };
  const service = new DockerService(docker as unknown as DockerApi, { hostName: "nas", ...options });
  return { service, docker };
}

describe("DockerService reads", () => {
  it("lists containers with filters and maps the result", async () => {
    const { service, docker } = makeService({});
    docker.listContainers.mockResolvedValue([
      {
        Id: "abcdef1234567890",
        Names: ["/web"],
        Image: "nginx",
        State: "running",
        Status: "Up 2h",
        Created: 1767225600,
        Ports: [{ IP: "0.0.0.0", PublicPort: 8080, PrivatePort: 80, Type: "tcp" }, { PrivatePort: 443, Type: "tcp" }],
      },
    ]);
    const result = await service.listContainers({ status: "running", label: "app=x" });
    expect(docker.listContainers).toHaveBeenCalledWith({ all: true, filters: { status: ["running"], label: ["app=x"] } });
    expect(result[0]).toMatchObject({ id: "abcdef123456", names: ["web"], ports: ["0.0.0.0:8080->80/tcp", "443/tcp"] });
  });

  it("copes with Docker returning null for ports and names", async () => {
    const { service, docker } = makeService({});
    docker.listContainers.mockResolvedValue([
      { Id: "abcdef1234567890", Names: null, Image: "x", State: "running", Status: "Up", Created: 0, Ports: null },
    ]);
    const result = await service.listContainers();
    expect(result[0]).toMatchObject({ names: [], ports: [] });
  });

  it("returns demultiplexed logs and caps the tail", async () => {
    const container = {
      inspect: vi.fn().mockResolvedValue(inspectInfo),
      logs: vi.fn().mockResolvedValue(Buffer.concat([frame(1, "out\n"), frame(2, "err\n")])),
    };
    const { service } = makeService(container);
    const result = await service.getLogs("web", { tail: 99999 });
    expect(container.logs).toHaveBeenCalledWith(expect.objectContaining({ tail: 2000, follow: false }));
    expect(result).toMatchObject({ stdout: "out\n", stderr: "err\n", tail: 2000, truncated: false });
  });

  it("truncates big logs keeping the end", async () => {
    const container = {
      inspect: vi.fn().mockResolvedValue({ ...inspectInfo, Config: { ...inspectInfo.Config, Tty: true } }),
      logs: vi.fn().mockResolvedValue(Buffer.from("0123456789")),
    };
    const result = await makeService(container).service.getLogs("web", { maxBytes: 4 });
    expect(result.truncated).toBe(true);
    expect(result.stdout).toBe("[truncated: 6 bytes omitted]\n6789");
  });

  it("converts 'since' to a timestamp", async () => {
    const container = { inspect: vi.fn().mockResolvedValue(inspectInfo), logs: vi.fn().mockResolvedValue(Buffer.alloc(0)) };
    await makeService(container).service.getLogs("web", { since: "10m" });
    expect(container.logs).toHaveBeenCalledWith(expect.objectContaining({ since: expect.any(Number) }));
  });

  it("projects inspect and redacts the environment", async () => {
    const container = { inspect: vi.fn().mockResolvedValue(inspectInfo) };
    const result = await makeService(container).service.inspect("web");
    expect(result).toMatchObject({
      id: "abcdef123456",
      name: "web",
      command: ["nginx"],
      ports: ["0.0.0.0:8080->80/tcp", "443/tcp"],
      env: ["PATH=/bin", "DB_PASSWORD=***REDACTED***"],
      mounts: [{ readOnly: true }],
    });
  });

  it("keeps the environment when redaction is disabled", async () => {
    const container = { inspect: vi.fn().mockResolvedValue(inspectInfo) };
    const result = await makeService(container, { readOnly: false, redact: false }).service.inspect("web");
    expect(result.env).toContain("DB_PASSWORD=hunter2");
  });

  it("redacts the environment in full mode too", async () => {
    const container = { inspect: vi.fn().mockResolvedValue(inspectInfo) };
    const result = (await makeService(container).service.inspect("web", { full: true })) as { Config: { Env: string[] } };
    expect(result.Config.Env).toContain("DB_PASSWORD=***REDACTED***");
  });

  it("returns a stats snapshot", async () => {
    const container = { stats: vi.fn().mockResolvedValue({ memory_stats: { usage: 50, limit: 100 } }) };
    const result = await makeService(container).service.stats("web");
    expect(result).toMatchObject({ container: "web", memoryPercent: 50 });
    expect(container.stats).toHaveBeenCalledWith({ stream: false });
  });
});

describe("DockerService writes", () => {
  it("runs start, stop, restart and remove with the right arguments", async () => {
    const container = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const { service } = makeService(container);
    expect(await service.start("web")).toEqual({ container: "web", action: "start", outcome: "done" });
    await service.stop("web", { timeoutSeconds: 5 });
    await service.restart("web");
    await service.remove("web");
    expect(container.stop).toHaveBeenCalledWith({ t: 5 });
    expect(container.restart).toHaveBeenCalledWith({});
    expect(container.remove).toHaveBeenCalledWith({ force: false, v: false });
  });

  it("only enables force and volumes when asked", async () => {
    const container = { remove: vi.fn().mockResolvedValue(undefined) };
    await makeService(container).service.remove("web", { force: true, volumes: true });
    expect(container.remove).toHaveBeenCalledWith({ force: true, v: true });
  });

  it("reports 304 as unchanged and rethrows other errors", async () => {
    const container = {
      start: vi.fn().mockRejectedValue({ statusCode: 304 }),
      stop: vi.fn().mockRejectedValue({ statusCode: 404 }),
    };
    const { service } = makeService(container);
    expect((await service.start("web")).outcome).toBe("unchanged");
    await expect(service.stop("web")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses every write on a read-only host without touching Docker", async () => {
    const { service, docker } = makeService({}, { readOnly: true, redact: true });
    for (const call of [() => service.start("a"), () => service.stop("a"), () => service.restart("a"), () => service.remove("a")]) {
      await expect(call()).rejects.toBeInstanceOf(ReadOnlyError);
    }
    expect(docker.getContainer).not.toHaveBeenCalled();
  });
});
