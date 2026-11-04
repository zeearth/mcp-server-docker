import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SshTunnel, type SshClientLike } from "../../src/docker/sshTunnel.js";

interface Behavior {
  connectError?: Error;
  execErrors?: Array<Error | undefined>;
}

class FakeClient extends EventEmitter {
  execCalls: string[] = [];
  streams: PassThrough[] = [];
  ended = false;
  constructor(private readonly behavior: Behavior = {}) {
    super();
  }
  connect(): void {
    queueMicrotask(() => (this.behavior.connectError ? this.emit("error", this.behavior.connectError) : this.emit("ready")));
  }
  exec(command: string, callback: (error: Error | undefined, stream: PassThrough) => void): void {
    this.execCalls.push(command);
    const error = this.behavior.execErrors?.shift();
    if (error) {
      callback(error, undefined as never);
      return;
    }
    const stream = new PassThrough();
    this.streams.push(stream);
    callback(undefined, stream);
  }
  end(): void {
    this.ended = true;
    queueMicrotask(() => this.emit("close"));
  }
}

/** Builds a tunnel whose clients follow the given behaviours, one per connection. */
function makeTunnel(behaviors: Behavior[] = [], extra: { maxChannels?: number; idleMs?: number } = {}) {
  const clients: FakeClient[] = [];
  const tunnel = new SshTunnel({
    command: "docker system dial-stdio",
    createClient: () => {
      const client = new FakeClient(behaviors[clients.length]);
      clients.push(client);
      return client as unknown as SshClientLike;
    },
    connectConfig: () => ({}),
    ...extra,
  });
  return { tunnel, clients };
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.useRealTimers();
});

describe("SshTunnel", () => {
  it("shares one SSH connection between concurrent requests", async () => {
    const { tunnel, clients } = makeTunnel();
    await Promise.all([tunnel.open(), tunnel.open(), tunnel.open()]);
    expect(clients).toHaveLength(1);
    expect(clients[0]?.execCalls).toEqual(Array(3).fill("docker system dial-stdio"));
  });

  it("makes extra requests wait when the channel limit is reached", async () => {
    const { tunnel, clients } = makeTunnel([], { maxChannels: 2 });
    await tunnel.open();
    await tunnel.open();
    let thirdOpen = false;
    const third = tunnel.open().then(() => {
      thirdOpen = true;
    });
    await flush();
    expect(thirdOpen).toBe(false);
    expect(clients[0]?.execCalls).toHaveLength(2);
    clients[0]?.streams[0]?.destroy();
    await third;
    expect(thirdOpen).toBe(true);
    expect(clients[0]?.execCalls).toHaveLength(3);
  });

  it("reconnects after the connection drops", async () => {
    const { tunnel, clients } = makeTunnel();
    await tunnel.open();
    clients[0]?.emit("close");
    await tunnel.open();
    expect(clients).toHaveLength(2);
  });

  it("does not crash on an error event after the connection is established", async () => {
    const { tunnel, clients } = makeTunnel();
    await tunnel.open();
    expect(() => clients[0]?.emit("error", new Error("reset"))).not.toThrow();
    await tunnel.open();
    expect(clients).toHaveLength(2);
  });

  it("rejects every waiting request when the connection fails, then tries again next time", async () => {
    const { tunnel, clients } = makeTunnel([{ connectError: new Error("All configured authentication methods failed") }]);
    const results = await Promise.allSettled([tunnel.open(), tunnel.open()]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(clients).toHaveLength(1);
    await expect(tunnel.open()).resolves.toBeDefined();
    expect(clients).toHaveLength(2);
  });

  it("retries once on a fresh connection when a reused connection fails to open a channel", async () => {
    const { tunnel, clients } = makeTunnel([{ execErrors: [undefined, new Error("Not connected")] }]);
    await tunnel.open();
    await tunnel.open();
    expect(clients).toHaveLength(2);
    expect(clients[0]?.ended).toBe(true);
  });

  it("does not retry when a fresh connection fails to open a channel", async () => {
    const { tunnel, clients } = makeTunnel([{ execErrors: [new Error("Channel open failure")] }]);
    await expect(tunnel.open()).rejects.toThrow("Channel open failure");
    expect(clients).toHaveLength(1);
  });

  it("closes the connection when idle and reconnects on demand", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { tunnel, clients } = makeTunnel([], { idleMs: 1000 });
    await tunnel.open();
    clients[0]?.streams[0]?.destroy();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(clients[0]?.ended).toBe(true);
    await tunnel.open();
    expect(clients).toHaveLength(2);
  });

  it("keeps the connection while a channel is still open", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { tunnel, clients } = makeTunnel([], { idleMs: 1000 });
    await tunnel.open();
    await tunnel.open();
    clients[0]?.streams[0]?.destroy();
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(clients[0]?.ended).toBe(false);
  });
});
