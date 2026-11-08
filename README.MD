# 🐳 mcp-server-docker

[![npm version](https://img.shields.io/npm/v/@zeearth/mcp-server-docker)](https://www.npmjs.com/package/@zeearth/mcp-server-docker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![M8ven Score](https://m8ven.ai/badge/mcp/zeearth-mcp-server-docker-xhrp3s)](https://m8ven.ai/mcp/zeearth-mcp-server-docker-xhrp3s?s=readme)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI assistants (Claude Code, Cursor, Claude Desktop) inspect and manage Docker environments, on one machine or on several.

Built with TypeScript and `dockerode`. It talks to the Docker Engine API directly (no `docker` CLI needed locally) over a local socket, TCP/TLS or SSH.

## ✨ Features

- **Multi-host**: drive several Docker daemons (your machine, a NAS, a server) from one server, each with a name.
- **Safe by design**: a global `--read-only` flag and a per-host `readOnly` option. Write tools are not even exposed when no host is writable, and every write is checked again in the service layer.
- **Context-friendly**: logs are demultiplexed and size-capped, `docker_inspect` returns a compact view, and every output is truncated with an explicit marker.
- **Secrets masked**: values are scanned, not just variable names. Passwords inside connection URLs (`postgres://user:pass@host`), `--password=` arguments, private keys, JWTs, common token formats and long encoded blobs are replaced by `***REDACTED***` in `docker_inspect` (environment, command, labels) and in logs. This is best-effort pattern matching: review output before sharing it. Disable with `--no-redact`.
- **Short, actionable errors**: no stack traces, and a failing host never breaks the others.

## 🛠 Tools

| Tool | Type | Description |
|---|---|---|
| `docker_list_hosts` | read | Configured hosts, URL (no credentials) and read-only flag. No connection is made. |
| `docker_list_containers` | read | Containers, stopped ones included. Filters: `status`, `name`, `label`. |
| `docker_get_logs` | read | Last lines of a container (default 200, max 2000), stdout and stderr separated. Supports `since` (`10m`, `2h`, ISO date). |
| `docker_inspect` | read | Compact view: state (exit code, OOM kill, start error, healthcheck detail), memory limit, image, ports, mounts, networks, command, env. `full: true` returns everything. |
| `docker_stats` | read | One-shot CPU, memory, network and process snapshot. |
| `docker_start` | write | Start a container. |
| `docker_stop` | write | Stop a container (optional `timeoutSeconds`). |
| `docker_restart` | write | Restart a container. |
| `docker_rm` | write | Remove one container by name or id. `force` and `volumes` are opt-in. |

Write tools are hidden when every host is read-only. Container references are names or ids, never patterns.

## 🚀 Quick Start

### Single host

Without a configuration file, the server uses `DOCKER_HOST` (or the local socket `/var/run/docker.sock`):

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

### Several hosts

Create a JSON file outside your repositories, for example `~/.config/mcp-server-docker/hosts.json`:

```json
{
  "defaultHost": "local",
  "hosts": {
    "local": { "url": "unix:///var/run/docker.sock" },
    "nas": {
      "url": "ssh://user@nas.lan:22",
      "readOnly": true,
      "dockerCommand": "/usr/local/bin/docker",
      "identityFile": "~/.ssh/nas-key"
    }
  }
}
```

Then point the server at it with `--config` (or the `MCP_DOCKER_CONFIG` environment variable):

```json
{
  "mcpServers": {
    "docker": {
      "command": "npx",
      "args": ["-y", "@zeearth/mcp-server-docker", "--config", "/home/me/.config/mcp-server-docker/hosts.json"]
    }
  }
}
```

With Claude Code (available in every project):

```bash
claude mcp add -s user docker -- npx -y --package=@zeearth/mcp-server-docker@latest mcp-server-docker --config <path>
```

> **Note**: MCP clients start the server from the current project directory. If that directory is itself this package (for example when you work on this repository), `npx -y @zeearth/mcp-server-docker` resolves to the local project and fails with `mcp-server-docker: not found`. The `--package=...@latest mcp-server-docker` form above always downloads the published package and avoids the problem. Keep the `@latest` (or a version): without it, `npx` still resolves the name to the local project.

#### Host options

| Field | Applies to | Description |
|---|---|---|
| `url` | all | `unix://`, `tcp://`, `http://`, `https://` or `ssh://`. No password in URLs. |
| `readOnly` | all | Forbid write tools on this host. |
| `ca`, `cert`, `key` | tcp/https | TLS files, referenced by path (relative paths resolve from the config file). |
| `dockerCommand` | ssh | Docker binary on the remote machine (default `docker`). |
| `identityFile` | ssh | Private key file (not passphrase-protected), if the key is not in your ssh-agent. |

#### How the `host` parameter works

Every tool takes a `host` parameter restricted to the configured names.

- With a single host it is optional.
- With several hosts, read tools use `defaultHost` when it is set.
- Write tools **always** need an explicit `host` when several are configured, so an action never lands on the wrong machine by omission.

### SSH hosts

The SSH transport opens a connection, runs `<dockerCommand> system dial-stdio` on the remote machine and tunnels the Docker API through it.

- **Port**: put it in the URL (`ssh://user@host:2345`). Your `~/.ssh/config` is not read.
- **Authentication**: ssh-agent (`SSH_AUTH_SOCK`) and/or `identityFile`.
- **Host key**: checked strictly against `~/.ssh/known_hosts`. Connect once with the `ssh` command to record a new host; a changed key is refused.
- **Remote docker**: the user must be allowed to run docker (e.g. `docker` group). Non-interactive SSH sessions often lack docker in `PATH` (Synology: `/usr/local/bin/docker`), hence `dockerCommand`.

## 🧠 Skills

The [skills/](skills/) folder contains agent skills that teach an assistant how to use these tools well. Copy them to `~/.claude/skills/` (or your project's `.claude/skills/`) to enable them.

- **docker-ops**: host selection, narrow-then-widen reads, and the rules for write actions (explicit host, confirmation, no `force` or `volumes` by default).
- **docker-triage**: a step-by-step method to find out why a container stopped, restarts or is unhealthy, with an exit-code table.
- **docker-health-report**: a short multi-host report that puts exceptions first and never blocks on an unreachable host.
- **docker-cleanup**: finds stale stopped containers and removes only an explicitly confirmed list, never with `force` or `volumes` by default.
- **docker-setup**: writes and debugs the hosts file, with a table mapping each SSH or Docker error to its fix.

## 🏗 Development

Everything runs in Docker, so nothing is installed on the host:

```bash
cp .env.example .env            # fill HOST_UID / HOST_GID
docker compose run --rm --no-deps node npm install
docker compose run --rm --no-deps node npm test
docker compose run --rm --no-deps node npm run typecheck
docker compose run --rm --no-deps node npm run build
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and [docs/ROADMAP.md](docs/ROADMAP.md) for the implementation plan.

## 🛡️ Security Considerations

Giving an AI agent access to a Docker daemon is equivalent to giving it root-level control of that machine.

1. Prefer `--read-only`, or `readOnly: true` on every host where lifecycle management is not needed.
2. Keep the configuration file and SSH keys outside the repository, readable only by you.
3. For SSH hosts, use a dedicated account with only the permissions it needs.
4. Redaction is best-effort: it recognizes common secret formats, but an unusual format can slip through. Treat any container output as potentially sensitive, and do not paste it into shared places.

## 📄 License

MIT
