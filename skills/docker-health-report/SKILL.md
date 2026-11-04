---
name: docker-health-report
description: Produce a concise health report across all configured Docker hosts using the docker MCP tools: stopped, unhealthy or restarting containers, and the heaviest memory consumers. Use when the user asks for an overview, a status report, "is everything fine?", or wants a periodic check of their Docker machines.
---

# Multi-host health report

Read-only. Follow the `docker-ops` rules for host selection and output limits.

## Steps

1. `docker_list_hosts` to get every host. Include all of them unless the user named some.
2. For each host, `docker_list_containers`. If a host fails, note the error in the report and continue with the others: one unreachable machine must not block the report.
3. Classify every container from its `state` and `status` text:
   - **Healthy**: running, with no `unhealthy` or `Restarting` in `status`.
   - **Needs attention**: `unhealthy`, `Restarting`, or running for only a few seconds or minutes while its neighbours have run for days (a likely crash loop).
   - **Stopped on purpose, probably**: `Exited (0)`, especially init, migrate or backup jobs.
   - **Stopped abnormally**: `Exited` with a non-zero code.
4. For the "needs attention" and "stopped abnormally" groups, call `docker_inspect` (compact) to get the exit code, `oomKilled` and the health detail. Do not inspect the healthy ones, **including recently started ones**: a short uptime is a hint to mention, not a reason to dump a container's configuration.
5. Memory: call `docker_stats` only for the containers that matter, at most about ten per host, for example the ones the user cares about, or the unhealthy ones. `docker_stats` is one call per container, so never loop over a whole fleet of dozens.

## Report format

Keep it short and put exceptions first.

```
Host nas (read-only) - 42 containers: 33 running, 9 stopped
  Needs attention
    - prism-web_blue-1: exited (137), not OOM, healthcheck failing (2). Killed, likely replaced by prism-web_green-1.
  Stopped, probably fine
    - monitoring-mongo-init-1, prism-migrate-1 (exit 0, one-shot jobs)
  Old stopped containers
    - bitnami-mongodb1 (exited 18 months ago)
  Running: 32 healthy
Host local - ...
Unreachable: <host>: <short error>
```

- Say how sure you are. "Likely replaced by" is a guess unless you saw the evidence.
- Do not list healthy containers one by one.
- End with at most three suggested actions. Do not perform any: changes need the user's go-ahead (see `docker-ops`).

## Running it regularly

This skill only reports. To repeat it, the user can run it from a recurring schedule (for example the `/loop` command in Claude Code) and read the result. Because the report is read-only, it is safe to automate; the write tools should stay out of any unattended run.
