import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { describeDockerError } from "../../toolbox/errors.js";
import { truncateWithMarker } from "../../toolbox/truncate.js";
import type { DockerService } from "../docker/DockerService.js";
import type { HostRegistry } from "../docker/HostRegistry.js";

/** Upper bound on the text returned by any tool, so one call cannot flood the model's context. */
export const MAX_OUTPUT_BYTES = 100_000;

/** Container reference: a name or an id, never a pattern, so a typo cannot hit several containers. */
export const containerSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "use a container name or id")
  .describe("Container name or id");

/** A tool ready to be registered on a server. */
export interface RegisterableTool {
  write: boolean;
  register(server: McpServer, registry: HostRegistry): void;
}

/** Declarative description of a tool that runs against one Docker host. */
export interface HostToolSpec<Shape extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  write: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  /** Input fields, without `host` which is added automatically. */
  shape: Shape;
  run: (service: DockerService, args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>;
}

/**
 * Builds the `host` input field from the configured hosts.
 * It is an enum of the configured names, optional only when a host can be chosen safely without it.
 * @param registry Host registry.
 * @param forWrite True for tools that modify state.
 * @returns A zod schema for the `host` field.
 */
export function hostParameter(registry: HostRegistry, forWrite: boolean): z.ZodType<string | undefined> {
  const hosts = registry.listHosts();
  const names = hosts.map((host) => host.name) as [string, ...string[]];
  const labels = hosts.map((host) => (host.readOnly ? `${host.name} (read-only)` : host.name)).join(", ");
  const defaultHost = hosts.find((host) => host.isDefault);
  const optional = registry.isHostOptional(forWrite);
  let description = `Docker host. Configured: ${labels}.`;
  if (optional && hosts.length > 1 && defaultHost) {
    description += ` Defaults to ${defaultHost.name}.`;
  }
  if (!optional) {
    description += forWrite ? " Required for actions that change state." : " Required.";
  }
  const base = z.enum(names).describe(description);
  return optional ? base.optional() : base;
}

/**
 * Wraps data as a JSON text result, capped at MAX_OUTPUT_BYTES.
 * @param data Any JSON-serializable value.
 * @returns A successful tool result.
 */
export function jsonResult(data: unknown): CallToolResult {
  const text = truncateWithMarker(JSON.stringify(data, null, 2), { maxBytes: MAX_OUTPUT_BYTES });
  return { content: [{ type: "text", text }] };
}

/**
 * Wraps an error as a short tool error, never a stack trace.
 * @param error Anything thrown by the service layer.
 * @param hostName Host the call targeted, if known.
 * @returns A tool result flagged as error.
 */
export function errorResult(error: unknown, hostName?: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: describeDockerError(error, hostName) }] };
}

/**
 * Turns a declarative spec into a registerable tool: adds the `host` field, resolves the target
 * host, runs the action and converts results and errors into MCP responses.
 * @param spec Tool description.
 * @returns A tool that can be registered on a server.
 */
export function defineHostTool<Shape extends z.ZodRawShape>(spec: HostToolSpec<Shape>): RegisterableTool {
  return {
    write: spec.write,
    register(server, registry) {
      // Typed as a plain raw shape: the generic `Shape` cannot be inferred through registerTool.
      const inputSchema: z.ZodRawShape = { ...spec.shape, host: hostParameter(registry, spec.write) };
      server.registerTool(
        spec.name,
        {
          title: spec.title,
          description: spec.description,
          inputSchema,
          annotations: {
            readOnlyHint: !spec.write,
            destructiveHint: spec.destructive ?? false,
            idempotentHint: spec.idempotent ?? !spec.write,
            openWorldHint: false,
          },
        },
        async (args) => {
          const { host, ...rest } = args;
          let hostName: string | undefined;
          try {
            hostName = registry.resolveHostName(host as string | undefined, spec.write);
            const result = await spec.run(registry.getService(hostName), rest as z.infer<z.ZodObject<Shape>>);
            return jsonResult(result);
          } catch (error) {
            return errorResult(error, hostName);
          }
        },
      );
    },
  };
}
