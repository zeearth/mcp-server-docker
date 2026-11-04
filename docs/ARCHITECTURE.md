# Architecture

## Goals

An MCP server (stdio) that lets AI assistants inspect and manage Docker through the Docker Engine API (`dockerode`, no CLI dependency). Connects via local socket, TCP/TLS or SSH (`DOCKER_HOST`). A `--read-only` flag prevents any mutation.

## Decisions

| Topic | Decision |
|---|---|
| Transport | stdio only (HTTP/SSE out of scope) |
| Hosts | multi-host from v1: named hosts in a JSON config, `host` parameter on every tool (see Multi-host) |
| Build | plain `tsc`, ESM, one JS file per source file in `dist/` |
| Validation | `zod` for tool inputs and config |
| Tests | `vitest`; unit tests mock `DockerService`; optional integration tests against the dev compose stack |
| Secrets in `docker_inspect` | redacted by default (`--no-redact` to disable) |
| Dev environment | everything runs in Docker; npm packages installed inside the container |

## Multi-host

One server process drives several Docker daemons (e.g. the local machine and a NAS).

### Config

A JSON file given by `--config <path>` (or `MCP_DOCKER_CONFIG`), validated with zod:

```json
{
  "defaultHost": "local",
  "hosts": {
    "local": { "url": "unix:///var/run/docker.sock" },
    "nas":   { "url": "ssh://user@nas.lan", "readOnly": true }
  }
}
```

- Without a config file, a single host named `default` is built from `DOCKER_HOST` (or the local socket), so the simple case keeps working.
- TLS material is referenced by file path (`ca`, `cert`, `key`), never inlined.
- No secret in the file; it lives outside the repo (the user's own config directory).

### Tool behavior

- Every tool takes a `host` parameter, restricted to an enum built from the configured names.
- `host` is optional with a single host. With several hosts it is **required** unless `defaultHost` is set, so an action never lands on the wrong machine by omission. Write tools ignore `defaultHost` and always require an explicit `host`.
- New tool `docker_list_hosts` (read): configured names, URL without credentials, `readOnly` flag. No connection attempt.

### Wiring

- `HostRegistry` maps name to `DockerService`, instantiated lazily on first use, so an unreachable NAS does not slow down or break the other hosts. A connection error is reported for that host only.
- `DockerService` receives its own `readOnly` (host flag OR global `--read-only`).

### Read-only

- Global `--read-only` applies to every host. A host can also be `readOnly: true` on its own.
- Write tools are registered only if at least one host is writable; each `DockerService` write method still re-checks its own flag.

## Tools

### Phase 1
| Tool | Type | Notes |
|---|---|---|
| `docker_list_containers` | read | filters: status, name, label; includes stopped |
| `docker_get_logs` | read | `tail` default 200, max 2000; `since`; byte-capped; stdout/stderr demultiplexed |
| `docker_inspect` | read | reduced projection by default; env redacted |
| `docker_stats` | read | one-shot snapshot (no streaming) |
| `docker_start` | write | hidden in read-only mode |
| `docker_stop` | write | hidden in read-only mode |
| `docker_restart` | write | hidden in read-only mode |
| `docker_rm` | write | `force` and `volumes` opt-in, never default; hidden in read-only mode |

### Phase 2 (read-only)
Images, volumes and networks listing/inspection.

## Layers

```
tools/            input schema (zod) + output formatting, no business logic
  └─ docker/DockerService   business logic (filters, projections, limits)
       └─ dockerode          Docker Engine API
toolbox/          pure reusable functions (truncate, redact, demuxLogs, errors)
config/           CLI flags + env -> AppConfig
```

## Read-only enforcement

Defense in depth, in two places:
1. `tools/registry.ts` does not register write tools when `readOnly` is true.
2. Every write method in `DockerService` re-checks the flag and throws.

## Output safety

- Logs and inspect output are truncated by bytes/lines, with an explicit "truncated" marker so the model knows data is missing.
- Env variables whose name matches `KEY|TOKEN|PASSWORD|SECRET|PASS|CREDENTIAL` have their value replaced by `***REDACTED***`.
- Docker errors (404, unreachable socket, permission denied) are mapped to short actionable messages, never raw stack traces.

## Layout

```
src/
  index.ts          entrypoint: parse CLI, wiring, start stdio
  server.ts         McpServer setup
  config/           AppConfig (zod)
  docker/           DockerClientFactory, DockerService, HostRegistry
  tools/            one file per tool + registry.ts
toolbox/            truncate.ts, redact.ts, demuxLogs.ts, errors.ts
test/
docs/
docker-compose.yml  dev environment
.env.example        documented keys, empty values
```

## Conventions

- No file over 500 lines; shared logic goes to `toolbox/`.
- No secret in committed files; `${VAR}` substitution from a git-ignored `.env`.
- Comments in English, only for non-trivial code.

## Open points

- Validate SSH (`ssh://`) through `docker-modem` in a non-TTY `npx` context and document prerequisites (ssh-agent, known_hosts).
- Decide the exact default projection of `docker_inspect`.
