# 🐳 mcp-server-docker

[![npm version](https://badge.fury.io/js/%40zeearth%2Fmcp-server-docker.svg)](https://badge.fury.io/js/%40zeearth%2Fmcp-server-docker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A robust and secure [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that allows AI assistants (like Claude Code, Cursor, and Claude Desktop) to inspect and manage Docker environments.

Built with TypeScript and `dockerode`, it supports local sockets, remote TCP, and SSH connections, bringing your infrastructure context directly into your AI workflows.

## ✨ Features

- **Zero-CLI Dependency**: Communicates directly with the Docker Engine API via `dockerode`.
- **Universal Connectivity**: Connect to local sockets (`/var/run/docker.sock`), remote hosts via TCP (with TLS), or securely via SSH tunnels.
- **Security First**: Optional `--read-only` flag to strictly prevent any mutation (stop, restart, rm) and only allow observation.
- **Granular Context**: Exposes logs, container states, and inspection data to LLMs without overflowing their context window.

## 🛠 Available MCP Tools

- `docker_list_containers`: List all containers (running and stopped) with filtering capabilities.
- `docker_get_logs`: Fetch tail logs for a specific container to debug crashes.
- `docker_inspect`: Retrieve detailed configuration, network, and volume mounts of a container.
- `docker_restart` / `docker_stop`: Manage container lifecycle (disabled in read-only mode).

## 🚀 Quick Start

### Using with Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "docker": {
      "command": "npx",
      "args": ["-y", "@zeearth/mcp-server-docker", "--read-only"]
    }
  }
}
```

### Remote Host Configuration (SSH)

To connect to a remote server (e.g., a NAS or production server), you can utilize standard Docker environment variables which this server respects automatically:

```json
{
  "mcpServers": {
    "docker-remote": {
      "command": "npx",
      "args": ["-y", "@zeearth/mcp-server-docker"],
      "env": {
        "DOCKER_HOST": "ssh://user@your-server.local"
      }
    }
  }
}
```

## 🏗 Development

This project embraces a "boring architecture" philosophy: predictable, strongly typed, and reliant on battle-tested libraries rather than hype.

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run locally in development mode
npm run dev
```

## 🛡️ Security Considerations

Exposing your Docker socket to an AI agent comes with inherent risks. We strongly recommend:

1. Always using the `--read-only` flag unless lifecycle management is strictly necessary.
2. Limiting the SSH user's permissions on the remote host if using `DOCKER_HOST=ssh://...`.

## 📄 License

MIT
