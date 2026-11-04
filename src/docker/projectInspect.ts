import type Docker from "dockerode";
import { redactEnv } from "../../toolbox/redact.js";

/**
 * Normalizes a Docker field that may be a string, an array or missing.
 * @param value Entrypoint or Cmd value.
 * @returns A string array.
 */
function toStringArray(value: string | string[] | null | undefined): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * Flattens the port map of a container into readable strings.
 * @param ports Docker `NetworkSettings.Ports` map.
 * @returns Entries like "0.0.0.0:8080->80/tcp", or just "80/tcp" when not published.
 */
function formatPorts(ports: Docker.PortMap | undefined): string[] {
  const result: string[] = [];
  for (const [containerPort, bindings] of Object.entries(ports ?? {})) {
    if (!bindings || bindings.length === 0) {
      result.push(containerPort);
      continue;
    }
    for (const binding of bindings) {
      result.push(`${binding.HostIp || "0.0.0.0"}:${binding.HostPort}->${containerPort}`);
    }
  }
  return result;
}

/**
 * Builds the reduced view of `docker inspect` returned by default.
 * It keeps what is useful to diagnose a container and drops the noisy rest.
 * @param info Raw inspect payload.
 * @param redact Whether to mask sensitive environment values.
 * @returns A compact object.
 */
export function projectInspect(info: Docker.ContainerInspectInfo, redact: boolean): Record<string, unknown> {
  const env = info.Config.Env ?? [];
  return {
    id: info.Id.slice(0, 12),
    name: info.Name.replace(/^\//, ""),
    image: info.Config.Image,
    created: info.Created,
    state: {
      status: info.State.Status,
      running: info.State.Running,
      exitCode: info.State.ExitCode,
      startedAt: info.State.StartedAt,
      finishedAt: info.State.FinishedAt,
      health: info.State.Health?.Status,
    },
    restartPolicy: info.HostConfig.RestartPolicy?.Name,
    restartCount: info.RestartCount,
    command: [...toStringArray(info.Config.Entrypoint), ...toStringArray(info.Config.Cmd)],
    ports: formatPorts(info.NetworkSettings.Ports),
    mounts: (info.Mounts ?? []).map((mount) => ({
      type: mount.Type,
      source: mount.Source,
      destination: mount.Destination,
      readOnly: !mount.RW,
    })),
    networks: Object.entries(info.NetworkSettings.Networks ?? {}).map(([name, network]) => ({
      name,
      ipAddress: network.IPAddress,
    })),
    env: redact ? redactEnv(env) : env,
    labels: info.Config.Labels ?? {},
  };
}

/**
 * Returns the complete inspect payload, still masking sensitive environment values.
 * @param info Raw inspect payload.
 * @param redact Whether to mask sensitive environment values.
 * @returns A copy of the payload.
 */
export function fullInspect(info: Docker.ContainerInspectInfo, redact: boolean): Record<string, unknown> {
  if (!redact) {
    return { ...info };
  }
  return { ...info, Config: { ...info.Config, Env: redactEnv(info.Config.Env ?? []) } };
}
