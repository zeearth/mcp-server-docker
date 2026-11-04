import { accessSync, constants, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ConfigError, parseCliArgs } from "./cli.js";
import { fileConfigSchema, type AppConfig, type HostConfig } from "./schema.js";

export interface ConfigDeps {
  readFile: (path: string) => string;
  canRead: (path: string) => boolean;
}

const DEFAULT_SOCKET_URL = "unix:///var/run/docker.sock";
const FALLBACK_HOST_NAME = "default";

const defaultDeps: ConfigDeps = {
  readFile: (path) => readFileSync(path, "utf8"),
  canRead: (path) => {
    try {
      accessSync(path, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  },
};

function resolveTlsPaths(host: HostConfig, baseDir: string, deps: ConfigDeps, name: string): HostConfig {
  const resolved = { ...host };
  for (const field of ["ca", "cert", "key"] as const) {
    const value = host[field];
    if (value === undefined) {
      continue;
    }
    const absolute = resolve(baseDir, value);
    if (!deps.canRead(absolute)) {
      throw new ConfigError(`host "${name}": cannot read ${field} file ${absolute}`);
    }
    resolved[field] = absolute;
  }
  return resolved;
}

function loadFromFile(path: string, deps: ConfigDeps): Pick<AppConfig, "hosts" | "defaultHost"> {
  let text: string;
  try {
    text = deps.readFile(path);
  } catch {
    throw new ConfigError(`cannot read config file ${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ConfigError(`config file ${path} is not valid JSON`);
  }
  const parsed = fileConfigSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`invalid config file ${path}: ${details}`);
  }
  const baseDir = dirname(resolve(path));
  const hosts: Record<string, HostConfig> = {};
  for (const [name, host] of Object.entries(parsed.data.hosts)) {
    hosts[name] = resolveTlsPaths(host, baseDir, deps, name);
  }
  return { hosts, defaultHost: parsed.data.defaultHost };
}

// Without a config file, a single host is built from the standard Docker env variables.
function buildFallbackHost(env: NodeJS.ProcessEnv): Record<string, HostConfig> {
  const certDir = env.DOCKER_CERT_PATH;
  const host: HostConfig = { url: env.DOCKER_HOST || DEFAULT_SOCKET_URL, readOnly: false };
  if (certDir) {
    host.ca = join(certDir, "ca.pem");
    host.cert = join(certDir, "cert.pem");
    host.key = join(certDir, "key.pem");
  }
  return { [FALLBACK_HOST_NAME]: host };
}

export function loadConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  deps: ConfigDeps = defaultDeps,
): AppConfig {
  const options = parseCliArgs(argv);
  const configPath = options.configPath ?? (env.MCP_DOCKER_CONFIG || undefined);
  const fromFile = configPath ? loadFromFile(configPath, deps) : undefined;
  return {
    hosts: fromFile?.hosts ?? buildFallbackHost(env),
    defaultHost: fromFile?.defaultHost,
    readOnly: options.readOnly,
    redact: options.redact,
  };
}
