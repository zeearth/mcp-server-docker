---
name: docker-triage
description: Diagnose a container that is down, restarting, unhealthy, slow or using too much memory, using the docker MCP tools. Use when the user asks why a container stopped, crashes, restarts, is unhealthy, or when they want a quick health check of a Docker host.
---

# Diagnosing a container

Follow the steps in order and stop as soon as the cause is clear. Use the `docker-ops` rules for host selection and output limits. Everything here is read-only.

## 1. Find the container

`docker_list_containers` on the right host. For "what is broken?" filter on `status: exited`, then look at the `status` text of the running ones for `unhealthy` or `Restarting`.

## 2. Read its state

`docker_inspect` (compact). Look at, in this order:

| Field | What it tells you |
|---|---|
| `state.exitCode` | How it ended. See the table below. |
| `state.oomKilled` | `true` means the kernel killed it for exceeding its memory limit. |
| `memoryLimitBytes` | The limit it was held to. Absent means no limit. |
| `state.error` | Why Docker could not even start it (bad command, missing mount, port in use). |
| `state.health` | `status`, `failingStreak` and `lastOutput`, the output of the last probe. |
| `restartCount`, `restartPolicy` | Whether it is looping, and whether Docker brings it back by itself. |
| `state.startedAt`, `state.finishedAt` | How long it ran before ending. Seconds means a startup failure. |
| `mounts`, `ports`, `command` | Configuration mistakes. |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Clean exit. Normal for init, migration or one-shot jobs. |
| 1 | The application failed: read the logs. |
| 126, 127 | Command not executable or not found: check `command` and the image. |
| 132 | Illegal instruction: the image uses CPU features the host lacks. Old images on small NAS CPUs are typical. |
| 137 | SIGKILL (128 + 9). If `oomKilled` is `true`, it ran out of memory. If `false`, something killed it: `docker kill`, a stop that exceeded its timeout, or a deployment replacing it. |
| 139 | Segmentation fault: a crash in the application or a native library. |
| 143 | SIGTERM (128 + 15): stopped on request. Usually intentional. |

## 3. Read the logs

`docker_get_logs` with `tail` around 50. Check `stderr` first, then `stdout`. If the container stopped long ago the end of the logs is still the most informative part. Look for the first error, not the last repeated one.

## 4. Check resources (running containers only)

`docker_stats`. Memory close to `memoryLimitBytes` explains a coming OOM kill. CPU pinned high points to a busy loop. Remember it is a single snapshot: take a second one a few seconds later before calling something a trend.

## 5. Report

Give a short diagnosis in this shape:

- **What happened**: one sentence, backed by the evidence (exit code, OOM flag, log line).
- **Likely cause**, and your confidence. Say plainly when two causes remain possible.
- **Suggested next step**. Offer a restart or a removal only as a suggestion. Do not perform it without the user's go-ahead (see `docker-ops`).

## Quick health check of a host

For "is everything fine on <host>?": list containers, then report only the exceptions: exited containers that are not one-shot jobs, `unhealthy` ones, and frequent restarts. Group the rest as "N running, all healthy" instead of listing them.
