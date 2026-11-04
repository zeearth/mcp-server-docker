#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError } from "./config/cli.js";
import { loadConfig } from "./config/loadConfig.js";
import { HostRegistry } from "./docker/HostRegistry.js";
import { createServer } from "./server.js";

/**
 * Entry point: loads the configuration and serves MCP over stdio.
 * Logs go to stderr only, because stdout carries the protocol.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.argv.slice(2), process.env);
  const server = createServer(new HostRegistry(config));
  await server.connect(new StdioServerTransport());
  console.error(`mcp-server-docker ready (hosts: ${Object.keys(config.hosts).join(", ")})`);
}

main().catch((error: unknown) => {
  const message = error instanceof ConfigError ? `Configuration error: ${error.message}` : String(error);
  console.error(message);
  process.exit(1);
});
