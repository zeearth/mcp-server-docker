import type { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";
import type { ConnectConfig } from "ssh2";

/** The part of an ssh2 client used by the tunnel, which keeps it easy to fake in tests. */
export interface SshClientLike extends EventEmitter {
  connect(config: ConnectConfig): unknown;
  exec(command: string, callback: (error: Error | undefined, stream: Duplex) => void): unknown;
  end(): unknown;
}

/** Settings of a tunnel. */
export interface SshTunnelOptions {
  /** Remote command that bridges stdin/stdout to the Docker API, e.g. "docker system dial-stdio". */
  command: string;
  createClient: () => SshClientLike;
  /** Called for every new SSH connection, so host keys are re-read when reconnecting. */
  connectConfig: () => ConnectConfig;
  /** Concurrent channels over the one connection. sshd allows 10 sessions by default (MaxSessions). */
  maxChannels?: number;
  /** Close the SSH connection after this long without any open channel. 0 disables it. */
  idleMs?: number;
}

const DEFAULT_MAX_CHANNELS = 6;
const DEFAULT_IDLE_MS = 60_000;

/**
 * One SSH connection shared by every Docker request of a host.
 * Each request opens a channel running the remote bridge command, instead of paying for a new
 * SSH handshake (and risking sshd's connection rate limit) per request. The connection is created
 * on demand, re-created when it drops, and closed when idle.
 */
export class SshTunnel {
  private client: SshClientLike | undefined;
  private connecting: Promise<SshClientLike> | undefined;
  private activeChannels = 0;
  private readonly waiting: Array<() => void> = [];
  private idleTimer: NodeJS.Timeout | undefined;
  private readonly maxChannels: number;
  private readonly idleMs: number;

  /**
   * @param options Command, client factory, connection settings and limits.
   */
  constructor(private readonly options: SshTunnelOptions) {
    this.maxChannels = options.maxChannels ?? DEFAULT_MAX_CHANNELS;
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  }

  /**
   * Opens a channel running the bridge command. It waits when too many channels are already open.
   * The channel slot is released when the returned stream closes.
   * @returns A duplex stream connected to the remote Docker daemon.
   * @throws The SSH error when the connection or the channel cannot be established.
   */
  async open(): Promise<Duplex> {
    await this.acquireSlot();
    try {
      const stream = await this.execWithRetry();
      stream.once("close", () => this.releaseSlot());
      return stream;
    } catch (error) {
      this.releaseSlot();
      throw error;
    }
  }

  /**
   * Closes the SSH connection now. Open channels end with it.
   */
  close(): void {
    this.clearIdleTimer();
    const client = this.client;
    if (client) {
      this.client = undefined;
      client.end();
    }
  }

  /**
   * Takes a channel slot, waiting for a release when the limit is reached.
   */
  private acquireSlot(): Promise<void> {
    this.clearIdleTimer();
    if (this.activeChannels < this.maxChannels) {
      this.activeChannels += 1;
      return Promise.resolve();
    }
    // The releasing channel hands its slot over, so the count stays unchanged.
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  /**
   * Gives a channel slot back, to the next waiting request or to the pool.
   */
  private releaseSlot(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
      return;
    }
    this.activeChannels -= 1;
    if (this.activeChannels === 0) {
      this.scheduleIdleClose();
    }
  }

  /**
   * Runs the command on the connection. A reused connection may have died silently, so a failure
   * there triggers one retry on a fresh connection; a failure on a fresh one is reported as is.
   */
  private async execWithRetry(): Promise<Duplex> {
    const reused = this.client !== undefined;
    const client = await this.getClient();
    try {
      return await this.exec(client);
    } catch (error) {
      if (!reused) {
        throw error;
      }
      this.dropClient(client);
      return this.exec(await this.getClient());
    }
  }

  /**
   * @param client Connected client.
   * @returns The channel stream running the bridge command.
   */
  private exec(client: SshClientLike): Promise<Duplex> {
    return new Promise<Duplex>((resolve, reject) => {
      client.exec(this.options.command, (error, stream) => (error ? reject(error) : resolve(stream)));
    });
  }

  /**
   * @returns The shared client, connecting first if needed. Concurrent callers share one attempt.
   */
  private getClient(): Promise<SshClientLike> {
    if (this.client) {
      return Promise.resolve(this.client);
    }
    this.connecting ??= this.connect();
    return this.connecting;
  }

  /**
   * Opens the SSH connection and keeps watching it: once it drops, the next request reconnects.
   */
  private connect(): Promise<SshClientLike> {
    return new Promise<SshClientLike>((resolve, reject) => {
      const client = this.options.createClient();
      let ready = false;
      client.once("ready", () => {
        ready = true;
        this.client = client;
        this.connecting = undefined;
        resolve(client);
      });
      // Always listen for errors: an unhandled "error" event would crash the process.
      client.on("error", (error: Error) => {
        if (ready) {
          this.forget(client);
          return;
        }
        this.connecting = undefined;
        reject(error);
      });
      client.on("close", () => {
        if (!ready) {
          this.connecting = undefined;
          reject(new Error("SSH connection closed before it was ready"));
          return;
        }
        this.forget(client);
      });
      try {
        client.connect(this.options.connectConfig());
      } catch (error) {
        this.connecting = undefined;
        reject(error);
      }
    });
  }

  /**
   * Stops using a client that is gone.
   * @param client The client to forget.
   */
  private forget(client: SshClientLike): void {
    if (this.client === client) {
      this.client = undefined;
    }
  }

  /**
   * Forgets a client and closes it.
   * @param client The client to drop.
   */
  private dropClient(client: SshClientLike): void {
    this.forget(client);
    client.end();
  }

  /**
   * Arms the idle timer that closes the connection when nothing uses it.
   */
  private scheduleIdleClose(): void {
    if (this.idleMs <= 0) {
      return;
    }
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.activeChannels === 0) {
        this.close();
      }
    }, this.idleMs);
    // Never keep the process alive just for an idle connection.
    this.idleTimer.unref();
  }

  /**
   * Cancels the idle timer.
   */
  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }
}
