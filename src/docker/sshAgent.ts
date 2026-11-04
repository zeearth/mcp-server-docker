import { readFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client, type Algorithms } from "ssh2";
import { SshTunnel, type SshClientLike } from "./sshTunnel.js";
import { algorithmsFor, findHostKeys } from "../../toolbox/knownHosts.js";

/** Connection settings of an SSH-tunnelled Docker host. */
export interface SshAgentOptions {
  host: string;
  port: number;
  username?: string;
  /** Path of the ssh-agent socket used for authentication. */
  agentSocket?: string;
  /** Private key content, for hosts whose key is not in the agent. */
  privateKey?: Buffer;
  readyTimeoutMs: number;
  /** Docker binary on the remote machine, run as `<command> system dial-stdio`. */
  dockerCommand: string;
  /** Returns the text of the known_hosts file, injectable for tests. */
  readKnownHosts?: () => string;
}

/**
 * Reads the user's known_hosts file.
 * @returns The file content, or an empty string when it does not exist.
 */
function readDefaultKnownHosts(): string {
  try {
    return readFileSync(join(homedir(), ".ssh", "known_hosts"), "utf8");
  } catch {
    return "";
  }
}

/**
 * Creates an HTTP agent that reaches the remote Docker daemon through one shared SSH connection.
 * It replaces docker-modem's built-in SSH agent for three reasons: the remote docker command is
 * configurable (non-interactive SSH sessions often lack it in PATH, e.g. on Synology), the server
 * key is checked against known_hosts (strict, like StrictHostKeyChecking=yes), and requests share a
 * single connection instead of opening one each (see `SshTunnel`).
 * @param options SSH settings.
 * @returns An agent to pass to dockerode.
 */
export function createSshAgent(options: SshAgentOptions): http.Agent {
  const readKnownHosts = options.readKnownHosts ?? readDefaultKnownHosts;
  const tunnel = new SshTunnel({
    command: `${options.dockerCommand} system dial-stdio`,
    createClient: () => new Client() as unknown as SshClientLike,
    connectConfig: () => {
      const trusted = findHostKeys(readKnownHosts(), options.host, options.port);
      return {
        host: options.host,
        port: options.port,
        username: options.username,
        agent: options.agentSocket,
        privateKey: options.privateKey,
        readyTimeout: options.readyTimeoutMs,
        // Offer only key types we already trust; refuse unknown or changed keys.
        algorithms: trusted.length > 0 ? { serverHostKey: algorithmsFor(trusted) as Algorithms["serverHostKey"] } : undefined,
        hostVerifier: (key: Buffer) => trusted.some((entry) => entry.keyBase64 === key.toString("base64")),
      };
    },
  });

  const agent = new http.Agent();
  agent.createConnection = (_requestOptions, callback) => {
    tunnel.open().then(
      (stream) => callback?.(null, stream as never),
      (error: unknown) => callback?.(error as Error, undefined as never),
    );
    return undefined;
  };
  return agent;
}
