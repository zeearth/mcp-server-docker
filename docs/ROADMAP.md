# Roadmap

Implementation plan, built bottom-up following the layers described in [ARCHITECTURE.md](ARCHITECTURE.md). Each step ends with `tsc --noEmit` and `vitest run`, both executed in the dev container.

## Step 0 - Toolchain check

- Create a minimal `src/index.ts` and run `docker compose run --rm --no-deps node npm run typecheck`.
- Verify three risks:
  - TypeScript 7 with `NodeNext`.
  - `@types/dockerode` 4.x against `dockerode` 5.x.
  - The bin path `dist/src/index.js`.
- If the types do not match, fix it here (local declaration or aligned version) before writing the rest.

## Step 1 - `toolbox/` (pure functions)

1. `truncate.ts`: cut by bytes and lines, with an explicit `[truncated: N bytes omitted]` marker.
2. `redact.ts`: mask env values whose name matches `KEY|TOKEN|PASSWORD|SECRET|PASS|CREDENTIAL`.
3. `demuxLogs.ts`: split stdout and stderr from the multiplexed Docker stream, and handle TTY containers (stream not multiplexed).
4. `errors.ts`: map Docker errors (404, unreachable socket, permission denied, SSH timeout) to short messages.

Tests: one file per module, including edge cases (empty stream, split frame, env entry without a value).

## Step 2 - `config/`

1. Zod schema: `hosts` (`url`, `readOnly`, `ca`, `cert`, `key`) and `defaultHost`.
2. Read `--config <path>` or `MCP_DOCKER_CONFIG`.
3. Fallback without a file: a single host `default` built from `DOCKER_HOST`, or the local socket.
4. Flags `--read-only` and `--no-redact`.
5. Validations:
   - `defaultHost` must exist in `hosts`.
   - TLS file paths must be readable.
   - No URL may embed a password.

Tests: valid config, invalid config, fallback, precedence flag > env.

## Step 3 - `docker/`

1. `DockerClientFactory`: build a dockerode instance from a URL (`unix://`, `tcp://`, `https://` with TLS, `ssh://`).
2. `DockerService`:
   - Read methods: `listContainers`, `getLogs`, `inspect`, `stats`.
   - Write methods: `start`, `stop`, `restart`, `remove`, each re-checking its own `readOnly` flag.
3. `HostRegistry`: map host name to `DockerService`, created on first use, and expose the host list without connecting.

Tests: `DockerService` against a mocked dockerode (filters, limits, read-only refusal). `HostRegistry` checks lazy creation and per-host error isolation.

## Step 4 - `tools/` and server

1. Shared helper that builds the `host` parameter: enum of configured names, required or optional depending on the host count, `defaultHost` handling, and the explicit-host rule for write tools.
2. One file per tool: `list_hosts`, `list_containers`, `get_logs`, `inspect`, `stats`, `start`, `stop`, `restart`, `rm`. Tools only do zod validation and formatting, no business logic.
3. `registry.ts`: register write tools only if at least one host is writable.
4. `server.ts` and `index.ts`: wiring and stdio transport. Logs go to stderr only, since stdout is reserved for the MCP protocol.

Tests: input schemas, conditional registration in read-only mode, mandatory `host` rule.

## Step 5 - Real-world integration (done)

1. Optional integration test against the local socket, using a disposable container.
2. Test the NAS over `ssh://`. This closes the open point on ssh-agent, `known_hosts` and the absence of a TTY under `npx`. Document the prerequisites.
3. Wire the server into Claude Code through a config file kept outside the repo.

## Step 6 - Finishing (done)

- Update the README: new tools, multi-host config, per-host read-only, and the read-only vs `rm` inconsistency.
- Settle the default projection of `docker_inspect`.
- Check file sizes (under 500 lines) and run `npm pack --dry-run` to verify the published content.

## Commit plan

1. toolbox
2. config
3. docker
4. tools and server
5. README

## Decisions to settle before step 4

- **`docker_inspect` projection**: proposed subset (image, state, ports, mounts, networks, healthcheck, redacted env) plus a `full` parameter to get everything.
- **`docker_rm`**: `force` and `volumes` default to `false`, the container name is explicit, and patterns are never accepted.
