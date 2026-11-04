import { readFileSync } from "node:fs";
import Docker from "dockerode";
import type { HostConfig } from "../config/schema.js";
import { createSshAgent } from "./sshAgent.js";

/** Side effects needed to build client options, injectable for tests. */
export interface FactoryDeps {
  readFile: (path: string) => Buffer;
  env: NodeJS.ProcessEnv;
}

const defaultDeps: FactoryDeps = { readFile: (path) => readFileSync(path), env: process.env };
const DEFAULT_HTTP_PORT = 2375;
const DEFAULT_TLS_PORT = 2376;
const DEFAULT_SSH_PORT = 22;
// Fail fast on an unreachable SSH host instead of waiting for the TCP timeout.
const SSH_READY_TIMEOUT_MS = 10_000;

/**
 * Reads the TLS files referenced by a host, if any.
 * @param host Host configuration (paths are already absolute).
 * @param deps File reader.
 * @returns The loaded certificate material (empty object when none is configured).
 */
function loadTlsMaterial(host: HostConfig, deps: FactoryDeps): Pick<Docker.DockerOptions, "ca" | "cert" | "key"> {
  const material: Pick<Docker.DockerOptions, "ca" | "cert" | "key"> = {};
  if (host.ca) {
    material.ca = deps.readFile(host.ca);
  }
  if (host.cert) {
    material.cert = deps.readFile(host.cert);
  }
  if (host.key) {
    material.key = deps.readFile(host.key);
  }
  return material;
}

/**
 * Translates a configured host into dockerode options.
 * Supports unix sockets, tcp/http, https (TLS from files) and ssh (ssh-agent, strict known_hosts).
 * @param host Host configuration.
 * @param deps File reader and environment (for SSH_AUTH_SOCK).
 * @returns Options ready to be passed to `new Docker(...)`.
 */
export function buildDockerOptions(host: HostConfig, deps: FactoryDeps = defaultDeps): Docker.DockerOptions {
  const parsed = new URL(host.url);

  if (parsed.protocol === "unix:") {
    return { socketPath: decodeURIComponent(parsed.pathname) };
  }

  if (parsed.protocol === "ssh:") {
    const sshPort = parsed.port ? Number(parsed.port) : DEFAULT_SSH_PORT;
    const agent = createSshAgent({
      host: parsed.hostname,
      port: sshPort,
      username: decodeURIComponent(parsed.username) || undefined,
      agentSocket: deps.env.SSH_AUTH_SOCK,
      privateKey: host.identityFile ? deps.readFile(host.identityFile) : undefined,
      readyTimeoutMs: SSH_READY_TIMEOUT_MS,
      dockerCommand: host.dockerCommand ?? "docker",
    });
    // The agent opens the tunnel, so dockerode sees a plain http host. `agent` is missing from the typings.
    return { protocol: "http", host: parsed.hostname, port: sshPort, agent } as Docker.DockerOptions;
  }

  const tls = loadTlsMaterial(host, deps);
  const useTls = parsed.protocol === "https:" || Object.keys(tls).length > 0;
  const defaultPort = useTls ? DEFAULT_TLS_PORT : DEFAULT_HTTP_PORT;
  return {
    protocol: useTls ? "https" : "http",
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : defaultPort,
    ...tls,
  };
}

/**
 * Creates a dockerode client for a configured host. No connection is made until the first call.
 * @param host Host configuration.
 * @param deps File reader and environment.
 * @returns A dockerode instance.
 */
export function createDockerClient(host: HostConfig, deps: FactoryDeps = defaultDeps): Docker {
  return new Docker(buildDockerOptions(host, deps));
}
