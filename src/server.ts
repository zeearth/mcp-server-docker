import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HostRegistry } from "./docker/HostRegistry.js";
import { registerTools } from "./tools/registry.js";

// Kept in sync with package.json by a unit test.
export const SERVER_VERSION = "0.1.0";

/**
 * Creates the MCP server with every tool registered for the given hosts.
 * @param registry Host registry.
 * @returns A server not yet connected to any transport.
 */
export function createServer(registry: HostRegistry): McpServer {
  const server = new McpServer({ name: "mcp-server-docker", version: SERVER_VERSION });
  registerTools(server, registry);
  return server;
}
