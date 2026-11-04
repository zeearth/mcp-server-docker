import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/config/schema.js";
import type { DockerApi } from "../../src/docker/DockerService.js";
import { HostRegistry } from "../../src/docker/HostRegistry.js";
import { SERVER_VERSION, createServer } from "../../src/server.js";

const WRITE_TOOLS = ["docker_start", "docker_stop", "docker_restart", "docker_rm"];
const READ_TOOLS = ["docker_list_hosts", "docker_list_containers", "docker_get_logs", "docker_inspect", "docker_stats"];

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    hosts: {
      local: { url: "unix:///var/run/docker.sock", readOnly: false },
      nas: { url: "ssh://bob:pw@nas.lan", readOnly: true },
    },
    defaultHost: "local",
    readOnly: false,
    redact: true,
    ...overrides,
  };
}

interface Harness {
  client: Client;
  clients: Record<string, { listContainers: ReturnType<typeof vi.fn>; container: Record<string, ReturnType<typeof vi.fn>> }>;
}

/** Connects a real MCP client to the server through an in-memory transport. */
async function connect(config: AppConfig): Promise<Harness> {
  const clients: Harness["clients"] = {};
  const registry = new HostRegistry(config, (host) => {
    const container = { start: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };
    const fake = { listContainers: vi.fn().mockResolvedValue([]), container };
    clients[host.url] = fake;
    return { listContainers: fake.listContainers, getContainer: () => container } as unknown as DockerApi;
  });
  const server = createServer(registry);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, clients };
}

async function toolNames(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((tool) => tool.name);
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ text: string }>)[0]?.text ?? "";
}

describe("tool registration", () => {
  it("exposes every tool when a host is writable", async () => {
    const { client } = await connect(makeConfig());
    expect(await toolNames(client)).toEqual(expect.arrayContaining([...READ_TOOLS, ...WRITE_TOOLS]));
  });

  it("hides write tools when the global read-only flag is set", async () => {
    const { client } = await connect(makeConfig({ readOnly: true }));
    const names = await toolNames(client);
    expect(names).toEqual(expect.arrayContaining(READ_TOOLS));
    for (const tool of WRITE_TOOLS) {
      expect(names).not.toContain(tool);
    }
  });

  it("keeps the declared version in sync with package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});

describe("host parameter", () => {
  it("is optional for reads (default host) and required for writes", async () => {
    const { client } = await connect(makeConfig());
    const tools = (await client.listTools()).tools;
    const read = tools.find((tool) => tool.name === "docker_list_containers");
    const write = tools.find((tool) => tool.name === "docker_stop");
    expect(read?.inputSchema.required ?? []).not.toContain("host");
    expect(write?.inputSchema.required).toContain("host");
    expect(JSON.stringify(write?.inputSchema.properties?.host)).toContain("nas");
  });

  it("is optional everywhere with a single host", async () => {
    const config = makeConfig({ hosts: { only: { url: "unix:///s", readOnly: false } }, defaultHost: undefined });
    const { client } = await connect(config);
    const stop = (await client.listTools()).tools.find((tool) => tool.name === "docker_stop");
    expect(stop?.inputSchema.required ?? []).not.toContain("host");
  });
});

describe("tool calls", () => {
  it("lists hosts without credentials and without connecting", async () => {
    const { client, clients } = await connect(makeConfig());
    const text = textOf(await client.callTool({ name: "docker_list_hosts", arguments: {} }));
    expect(text).toContain("ssh://bob@nas.lan");
    expect(text).not.toContain("pw");
    expect(Object.keys(clients)).toHaveLength(0);
  });

  it("runs a read tool on the default host", async () => {
    const { client, clients } = await connect(makeConfig());
    const result = await client.callTool({ name: "docker_list_containers", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(clients["unix:///var/run/docker.sock"]?.listContainers).toHaveBeenCalled();
  });

  it("runs a write tool on an explicit writable host", async () => {
    const { client, clients } = await connect(makeConfig());
    const result = await client.callTool({ name: "docker_start", arguments: { container: "web", host: "local" } });
    expect(textOf(result)).toContain('"outcome": "done"');
    expect(clients["unix:///var/run/docker.sock"]?.container.start).toHaveBeenCalled();
  });

  it("refuses a write on a read-only host with a clear message", async () => {
    const { client } = await connect(makeConfig());
    const result = await client.callTool({ name: "docker_rm", arguments: { container: "web", host: "nas" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Host "nas" is read-only');
  });

  it("rejects a write without host when several are configured", async () => {
    const { client } = await connect(makeConfig());
    const result = await client.callTool({ name: "docker_stop", arguments: { container: "web" } });
    expect(result.isError).toBe(true);
  });

  it("rejects container patterns", async () => {
    const { client } = await connect(makeConfig());
    const result = await client.callTool({ name: "docker_rm", arguments: { container: "web*", host: "local" } });
    expect(result.isError).toBe(true);
  });

  it("reports a Docker failure as a short error", async () => {
    const { client } = await connect(makeConfig());
    const result = await client.callTool({ name: "docker_inspect", arguments: { container: "web" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain("    at ");
  });
});
