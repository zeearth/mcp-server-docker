---
name: docker-ops
description: Rules for using the docker MCP tools (docker_list_hosts, docker_list_containers, docker_get_logs, docker_inspect, docker_stats, docker_start, docker_stop, docker_restart, docker_rm) safely and efficiently. Use whenever the user asks about containers, logs, Docker state, or wants to start, stop, restart or remove a container, on this machine or on a remote host such as a NAS.
---

# Working with the docker MCP tools

## Before anything else

1. Call `docker_list_hosts` once per conversation. It shows the configured hosts and which ones are read-only. It does not open any connection.
2. Pick the host from what the user said ("on my NAS" means the host that points to it). If it is ambiguous, ask instead of guessing.

## Reading

- Start narrow, widen only if needed:
  - `docker_list_containers` with a `status`, `name` or `label` filter instead of listing everything on a busy host.
  - `docker_get_logs` with a small `tail` (30 to 50). If the cause is not visible, use `since` (for example `10m`) or raise `tail`. The maximum is 2000.
  - `docker_inspect` in its default compact form. Use `full: true` only for a field the compact view does not show, because the output is large.
- Output can be truncated. A `[truncated: N bytes omitted]` marker means data is missing: say so, and narrow the query rather than concluding from partial output.
- Secrets in environment values, URLs, commands and logs are masked as `***REDACTED***`. Never try to work around that, and never ask for the real values.
- Masking is best-effort. If a password, token or key still appears in a result, **do not repeat or quote it**. Tell the user which container and variable leaked it (by name only) and that it should be rotated, since the value is now in this conversation.
- Call `docker_inspect` only when it answers a question that the listing or the logs cannot (exit code, health, limits, mounts). Do not inspect healthy containers out of curiosity: the output carries their configuration.
- `docker_stats` is a one-shot snapshot, not a rate. Network counters are cumulative since the container started. `pids` can be 0 on older daemons: do not report it as a finding.

## Changing things

Write tools (`docker_start`, `docker_stop`, `docker_restart`, `docker_rm`) change a real machine.

- **Always pass `host` explicitly**, even if a default exists.
- **Say what you are about to do and wait for the user's go-ahead** before stop, restart or rm, unless the user already asked for exactly that action on that container and host.
- **Never use `force` or `volumes` on `docker_rm`** unless the user explicitly asks for them in this conversation. `volumes: true` deletes data.
- Act on one container at a time, by exact name or id. Patterns are rejected on purpose.
- After an action, verify: list or inspect the container and report the real state, not the expected one.
- A result of `unchanged` means the container was already in the requested state. It is not an error.
- If a host is read-only the tool refuses with a clear message. Report it and stop. Do not look for a way around it.

## Errors

Errors are prefixed with the host name, for example `[nas] ...`. A failing host does not affect the others. For SSH errors (authentication, host key, unreachable), tell the user what the message says. It names the fix, such as recording the host key with the `ssh` command.
