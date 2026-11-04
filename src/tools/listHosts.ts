import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HostRegistry } from "../docker/HostRegistry.js";
import { jsonResult } from "./toolkit.js";

/**
 * Registers `docker_list_hosts`: shows configured hosts without opening any connection.
 * @param server MCP server.
 * @param registry Host registry.
 */
export function registerListHosts(server: McpServer, registry: HostRegistry): void {
  server.registerTool(
    "docker_list_hosts",
    {
      title: "List Docker hosts",
      description: "List the configured Docker hosts, their URL (no credentials) and whether they are read-only.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => jsonResult(registry.listHosts()),
  );
}
