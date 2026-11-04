import type { AppConfig } from "../config/schema.js";
import { sanitizeUrl } from "../../toolbox/sanitizeUrl.js";
import { createDockerClient } from "./DockerClientFactory.js";
import { DockerService, type DockerApi } from "./DockerService.js";
import { HostSelectionError, UnknownHostError } from "./errors.js";

/** Public description of a host, safe to show to the model. */
export interface HostInfo {
  name: string;
  url: string;
  readOnly: boolean;
  isDefault: boolean;
}

/** Builds a Docker client for a host config; replaceable in tests. */
export type ClientFactory = (host: AppConfig["hosts"][string]) => DockerApi;

/**
 * Maps host names to lazily created `DockerService` instances.
 * An unreachable host only fails when it is used, never at startup or for the other hosts.
 */
export class HostRegistry {
  private readonly services = new Map<string, DockerService>();

  /**
   * @param config Application configuration.
   * @param createClient Client factory, defaults to dockerode.
   */
  constructor(
    private readonly config: AppConfig,
    private readonly createClient: ClientFactory = createDockerClient,
  ) {}

  /**
   * @returns The configured host names, in declaration order.
   */
  hostNames(): string[] {
    return Object.keys(this.config.hosts);
  }

  /**
   * Computes the effective read-only flag: the global flag OR the host's own flag.
   * @param name Configured host name.
   * @returns True when write operations are forbidden on that host.
   */
  isReadOnly(name: string): boolean {
    return this.config.readOnly || this.requireHost(name).readOnly;
  }

  /**
   * Tells whether write tools are worth registering.
   * @returns True when at least one host accepts write operations.
   */
  hasWritableHost(): boolean {
    return this.hostNames().some((name) => !this.isReadOnly(name));
  }

  /**
   * Describes all hosts without opening any connection.
   * @returns Name, sanitized URL, effective read-only flag and default marker per host.
   */
  listHosts(): HostInfo[] {
    const defaultName = this.defaultHostName();
    return this.hostNames().map((name) => ({
      name,
      url: sanitizeUrl(this.requireHost(name).url),
      readOnly: this.isReadOnly(name),
      isDefault: name === defaultName,
    }));
  }

  /**
   * Chooses the host a tool call applies to, so an action never lands on the wrong machine by omission.
   * An explicit name always wins. Without one: a single host is used; with several hosts the
   * configured default is used for read tools only. Write tools always need an explicit host.
   * @param requested Host name given in the tool input, if any.
   * @param forWrite True for tools that modify state.
   * @returns A configured host name.
   * @throws UnknownHostError for an unknown name, HostSelectionError when the choice is ambiguous.
   */
  resolveHostName(requested: string | undefined, forWrite: boolean): string {
    if (requested !== undefined) {
      this.requireHost(requested);
      return requested;
    }
    const names = this.hostNames();
    if (names.length === 1) {
      return names[0] as string;
    }
    const defaultName = this.defaultHostName();
    if (!forWrite && defaultName !== undefined) {
      return defaultName;
    }
    const reason = forWrite ? "Write operations need an explicit host" : "A host is required";
    throw new HostSelectionError(`${reason}. Choose one of: ${names.join(", ")}.`);
  }

  /**
   * Tells whether a tool may omit its `host` parameter, mirroring `resolveHostName`.
   * @param forWrite True for tools that modify state.
   * @returns True when a host can always be chosen without the caller naming one.
   */
  isHostOptional(forWrite: boolean): boolean {
    return this.hostNames().length === 1 || (!forWrite && this.defaultHostName() !== undefined);
  }

  /**
   * Returns the service of a host, creating it on first use.
   * @param name Configured host name.
   * @returns The host's service.
   * @throws UnknownHostError when the name is not configured.
   */
  getService(name: string): DockerService {
    const existing = this.services.get(name);
    if (existing) {
      return existing;
    }
    const host = this.requireHost(name);
    const service = new DockerService(this.createClient(host), {
      hostName: name,
      readOnly: this.isReadOnly(name),
      redact: this.config.redact,
    });
    this.services.set(name, service);
    return service;
  }

  /**
   * @returns The configured default host, or undefined when none is set.
   */
  private defaultHostName(): string | undefined {
    return this.config.defaultHost;
  }

  /**
   * Looks up a host config.
   * @param name Host name.
   * @returns The host config.
   * @throws UnknownHostError when the name is not configured.
   */
  private requireHost(name: string): AppConfig["hosts"][string] {
    const host = this.config.hosts[name];
    if (!host) {
      throw new UnknownHostError(name, this.hostNames());
    }
    return host;
  }
}
