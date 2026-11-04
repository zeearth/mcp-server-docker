import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HostRegistry } from "../docker/HostRegistry.js";
import { getLogsTool } from "./getLogs.js";
import { inspectTool } from "./inspect.js";
import { listContainersTool } from "./listContainers.js";
import { registerListHosts } from "./listHosts.js";
import { restartTool } from "./restart.js";
import { rmTool } from "./rm.js";
import { startTool } from "./start.js";
import { statsTool } from "./stats.js";
import { stopTool } from "./stop.js";
import type { RegisterableTool } from "./toolkit.js";

const ALL_TOOLS: RegisterableTool[] = [
  listContainersTool,
  getLogsTool,
  inspectTool,
  statsTool,
  startTool,
  stopTool,
  restartTool,
  rmTool,
];

/**
 * Registers the tools on the server. First line of the read-only defence: write tools are not
 * exposed at all when no host is writable (each service method still re-checks its own flag).
 * @param server MCP server.
 * @param registry Host registry.
 */
export function registerTools(server: McpServer, registry: HostRegistry): void {
  registerListHosts(server, registry);
  const exposeWrites = registry.hasWritableHost();
  for (const tool of ALL_TOOLS) {
    if (!tool.write || exposeWrites) {
      tool.register(server, registry);
    }
  }
}
