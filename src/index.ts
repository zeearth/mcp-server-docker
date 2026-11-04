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
  // An open SSH connection would keep the process alive after the client is gone: leave right away.
  // The stdio transport does not report the end of stdin, so listen for it directly.
  server.server.onclose = () => process.exit(0);
  process.stdin.on("end", () => process.exit(0));
  process.stdin.on("close", () => process.exit(0));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => process.exit(0));
  }
  await server.connect(new StdioServerTransport());
  console.error(`mcp-server-docker ready (hosts: ${Object.keys(config.hosts).join(", ")})`);
}

main().catch((error: unknown) => {
  const message = error instanceof ConfigError ? `Configuration error: ${error.message}` : String(error);
  console.error(message);
  process.exit(1);
});
