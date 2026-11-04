---
name: docker-cleanup
description: Find and remove stale Docker containers (long-stopped, auto-named, forgotten test containers) safely with the docker MCP tools, one confirmed batch at a time. Use when the user asks to clean up, prune, tidy or free space on a Docker host, or to remove old stopped containers.
---

# Cleaning up stopped containers

This skill removes things, so it is deliberately slow and explicit. Follow the `docker-ops` rules, and never skip the confirmation step.

## 1. Check the host can be changed

`docker_list_hosts`. If the target host is read-only, say so, still produce the candidate list below, and stop there: the user can remove them another way.

## 2. Build the candidate list (read-only)

`docker_list_containers` with `status: exited` on the chosen host. Never consider running, paused or restarting containers.

For each stopped container decide a category:

- **Likely forgotten**: an auto-generated name (two words joined by an underscore, such as `confident_agnesi`), or stopped for many months.
- **Probably deliberate**: names like `*-init-*`, `*-migrate-*`, `*-backup-*`, or `Exited (0)` within the last weeks. These are often one-shot jobs that a deployment script runs again. Do not propose them unless the user asks.
- **Unclear**: everything else. Ask.

For the candidates, call `docker_inspect` (compact) and note:

- `mounts` of type `volume`, or bind mounts holding data. Removing the container does not delete bind-mounted files, but `volumes: true` would delete anonymous volumes.
- `finishedAt`, to state the real age.
- The image, since a data store image (a database, for example) deserves extra care.

## 3. Ask for confirmation

Show a table with, for each candidate: name, image, how long it has been stopped, exit code and any data warning. Then ask the user to confirm the **exact list**. Wait for the answer. "Clean everything" is not a confirmation of a list you have not shown.

## 4. Remove

- One container at a time, with `docker_rm`, passing `host` and the exact name.
- Leave `force` and `volumes` at their defaults. If the user wants volumes deleted, ask separately, naming the containers whose volumes would be lost, and only then pass `volumes: true` for those.
- Stop at the first unexpected error and report it.

## 5. Verify and report

`docker_list_containers` again. Report what was removed, what was kept and why, and anything that failed. Do not claim disk space was freed: this tool removes containers, not images or volumes, so say which of those remain.
