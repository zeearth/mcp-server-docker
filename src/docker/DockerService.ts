import type Docker from "dockerode";
import { demuxLogs } from "../../toolbox/demuxLogs.js";
import { parseSince } from "../../toolbox/since.js";
import { computeStats, type RawStats } from "../../toolbox/stats.js";
import { truncateTextWithMarker } from "../../toolbox/truncate.js";
import { ReadOnlyError } from "./errors.js";
import { fullInspect, projectInspect } from "./projectInspect.js";
import type {
  ActionResult,
  ContainerStatsResult,
  ContainerSummary,
  InspectOptions,
  ListFilters,
  LogsOptions,
  LogsResult,
  RemoveOptions,
  StopOptions,
} from "./types.js";

/** The part of dockerode used by the service, which keeps it easy to mock. */
export type DockerApi = Pick<Docker, "listContainers" | "getContainer">;

/** Per-host behaviour of a service. */
export interface ServiceOptions {
  hostName: string;
  readOnly: boolean;
  redact: boolean;
}

export const DEFAULT_TAIL = 200;
export const MAX_TAIL = 2000;
export const DEFAULT_MAX_LOG_BYTES = 50_000;
const SHORT_ID_LENGTH = 12;
const NOT_MODIFIED = 304;

/**
 * Business logic for one Docker daemon: filters, projections, limits and the read-only guard.
 * Errors are not caught here: the tool layer maps them with `describeDockerError`.
 */
export class DockerService {
  /**
   * @param docker Docker client (or a compatible mock).
   * @param options Host name, effective read-only flag and redaction setting.
   */
  constructor(
    private readonly docker: DockerApi,
    private readonly options: ServiceOptions,
  ) {}

  /**
   * Lists containers, including stopped ones.
   * @param filters Optional status, name (substring match done by Docker) and label ("key" or "key=value").
   * @returns One summary per container.
   */
  async listContainers(filters: ListFilters = {}): Promise<ContainerSummary[]> {
    const dockerFilters: Record<string, string[]> = {};
    if (filters.status) {
      dockerFilters.status = [filters.status];
    }
    if (filters.name) {
      dockerFilters.name = [filters.name];
    }
    if (filters.label) {
      dockerFilters.label = [filters.label];
    }
    const containers = await this.docker.listContainers({ all: true, filters: dockerFilters });
    return containers.map((container) => ({
      id: container.Id.slice(0, SHORT_ID_LENGTH),
      names: container.Names.map((name) => name.replace(/^\//, "")),
      image: container.Image,
      state: container.State,
      status: container.Status,
      ports: container.Ports.map((port) =>
        port.PublicPort
          ? `${port.IP ?? "0.0.0.0"}:${port.PublicPort}->${port.PrivatePort}/${port.Type}`
          : `${port.PrivatePort}/${port.Type}`,
      ),
      created: new Date(container.Created * 1000).toISOString(),
    }));
  }

  /**
   * Reads container logs, split by stream and capped in size. The end of the logs is kept.
   * @param containerId Container name or id.
   * @param options Line count (default 200, capped at 2000), start time and byte cap per stream.
   * @returns Demultiplexed logs with a truncation flag.
   */
  async getLogs(containerId: string, options: LogsOptions = {}): Promise<LogsResult> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    const tail = Math.min(Math.max(options.tail ?? DEFAULT_TAIL, 1), MAX_TAIL);
    const raw = await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
      tail,
      ...(options.since ? { since: parseSince(options.since) } : {}),
    });
    const demuxed = demuxLogs(raw, { tty: info.Config.Tty });
    const limits = { maxBytes: options.maxBytes ?? DEFAULT_MAX_LOG_BYTES, keep: "tail" as const };
    const stdout = truncateTextWithMarker(demuxed.stdout, limits);
    const stderr = truncateTextWithMarker(demuxed.stderr, limits);
    return { stdout: stdout.text, stderr: stderr.text, tail, truncated: stdout.truncated || stderr.truncated };
  }

  /**
   * Inspects a container.
   * @param containerId Container name or id.
   * @param options `full: true` returns the complete payload instead of the reduced projection.
   * @returns The inspect data, with sensitive environment values masked unless redaction is disabled.
   */
  async inspect(containerId: string, options: InspectOptions = {}): Promise<Record<string, unknown>> {
    const info = await this.docker.getContainer(containerId).inspect();
    return options.full ? fullInspect(info, this.options.redact) : projectInspect(info, this.options.redact);
  }

  /**
   * Takes a one-shot statistics snapshot (no streaming).
   * @param containerId Container name or id.
   * @returns CPU, memory, network and process counts.
   */
  async stats(containerId: string): Promise<ContainerStatsResult> {
    const raw = await this.docker.getContainer(containerId).stats({ stream: false });
    return { container: containerId, ...computeStats(raw as RawStats) };
  }

  /**
   * Starts a container.
   * @param containerId Container name or id.
   * @returns "unchanged" when it was already running.
   * @throws ReadOnlyError when the host is read-only.
   */
  async start(containerId: string): Promise<ActionResult> {
    this.assertWritable("docker_start");
    return this.runAction(containerId, "start", () => this.docker.getContainer(containerId).start());
  }

  /**
   * Stops a container.
   * @param containerId Container name or id.
   * @param options Seconds to wait before killing the process.
   * @returns "unchanged" when it was already stopped.
   * @throws ReadOnlyError when the host is read-only.
   */
  async stop(containerId: string, options: StopOptions = {}): Promise<ActionResult> {
    this.assertWritable("docker_stop");
    return this.runAction(containerId, "stop", () =>
      this.docker.getContainer(containerId).stop(this.timeoutArgument(options)),
    );
  }

  /**
   * Restarts a container.
   * @param containerId Container name or id.
   * @param options Seconds to wait before killing the process.
   * @returns The action result.
   * @throws ReadOnlyError when the host is read-only.
   */
  async restart(containerId: string, options: StopOptions = {}): Promise<ActionResult> {
    this.assertWritable("docker_restart");
    return this.runAction(containerId, "restart", () =>
      this.docker.getContainer(containerId).restart(this.timeoutArgument(options)),
    );
  }

  /**
   * Removes a container. Force and volume removal are opt-in.
   * @param containerId Container name or id (never a pattern).
   * @param options `force` removes a running container, `volumes` removes its anonymous volumes.
   * @returns The action result.
   * @throws ReadOnlyError when the host is read-only.
   */
  async remove(containerId: string, options: RemoveOptions = {}): Promise<ActionResult> {
    this.assertWritable("docker_rm");
    return this.runAction(containerId, "remove", () =>
      this.docker.getContainer(containerId).remove({ force: options.force === true, v: options.volumes === true }),
    );
  }

  /**
   * Guards every write method, as a second line of defence after the tool registry.
   * @param action Tool name used in the error message.
   * @throws ReadOnlyError when the host is read-only.
   */
  private assertWritable(action: string): void {
    if (this.options.readOnly) {
      throw new ReadOnlyError(this.options.hostName, action);
    }
  }

  /**
   * Builds the `t` argument of stop/restart, omitted when no timeout was requested.
   * @param options Stop options.
   * @returns Arguments for dockerode.
   */
  private timeoutArgument(options: StopOptions): { t?: number } {
    return options.timeoutSeconds === undefined ? {} : { t: options.timeoutSeconds };
  }

  /**
   * Runs a write call and turns Docker's "304 Not Modified" into an "unchanged" outcome.
   * @param containerId Container the action targets.
   * @param action Action name for the result.
   * @param call The dockerode call to perform.
   * @returns The action result.
   */
  private async runAction(
    containerId: string,
    action: ActionResult["action"],
    call: () => Promise<unknown>,
  ): Promise<ActionResult> {
    try {
      await call();
      return { container: containerId, action, outcome: "done" };
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === NOT_MODIFIED) {
        return { container: containerId, action, outcome: "unchanged" };
      }
      throw error;
    }
  }
}
