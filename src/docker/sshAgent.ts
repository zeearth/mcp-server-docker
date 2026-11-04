import { readFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client, type Algorithms } from "ssh2";
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
 * Creates an HTTP agent that reaches the remote Docker daemon through SSH.
 * It replaces docker-modem's built-in SSH agent for two reasons: the remote docker command is
 * configurable (non-interactive SSH sessions often lack it in PATH, e.g. on Synology), and the
 * server key is checked against known_hosts (strict, like StrictHostKeyChecking=yes).
 * A fresh SSH connection is opened per HTTP connection and closed when the stream ends.
 * @param options SSH settings.
 * @returns An agent to pass to dockerode.
 */
export function createSshAgent(options: SshAgentOptions): http.Agent {
  const agent = new http.Agent();
  const readKnownHosts = options.readKnownHosts ?? readDefaultKnownHosts;

  agent.createConnection = (_requestOptions, callback) => {
    const trusted = findHostKeys(readKnownHosts(), options.host, options.port);
    const client = new Client();
    let settled = false;

    /**
     * Reports a failure once and closes the SSH connection.
     * @param error The failure.
     */
    const fail = (error: Error): void => {
      client.end();
      if (!settled) {
        settled = true;
        callback?.(error, undefined as never);
      }
    };

    client
      .once("ready", () => {
        client.exec(`${options.dockerCommand} system dial-stdio`, (error, stream) => {
          if (error) {
            fail(error);
            return;
          }
          settled = true;
          stream.once("close", () => client.end());
          callback?.(null, stream as never);
        });
      })
      .once("error", fail)
      .connect({
        host: options.host,
        port: options.port,
        username: options.username,
        agent: options.agentSocket,
        privateKey: options.privateKey,
        readyTimeout: options.readyTimeoutMs,
        // Offer only key types we already trust; refuse unknown or changed keys.
        algorithms: trusted.length > 0 ? { serverHostKey: algorithmsFor(trusted) as Algorithms["serverHostKey"] } : undefined,
        hostVerifier: (key: Buffer) => trusted.some((entry) => entry.keyBase64 === key.toString("base64")),
      });
    return undefined;
  };
  return agent;
}
