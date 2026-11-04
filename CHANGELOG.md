# Changelog

## 0.1.1

### Security

- **Secret redaction now scans values, not only variable names.** In 0.1.0, a secret stored in a variable with an ordinary name (for example a `DATABASE_URL` with a password inside, or an encoded service-account blob) was returned in clear by `docker_inspect`. Passwords in connection URLs, `--password=` arguments, private keys, JWTs, common token formats and long base64 blobs are now masked in the environment, the command, labels, the full inspect payload (Docker repeats the environment in `HostConfig.Env`) and in container logs.
- If you used 0.1.0 against containers that hold secrets, treat any value shown to an assistant as exposed and rotate it.

### Added

- `docker_inspect` now reports `oomKilled`, `paused`, `restarting`, the Docker start `error`, `memoryLimitBytes` and the healthcheck detail (failing streak and last probe output).
- Agent skills in `skills/`: `docker-ops`, `docker-triage`, `docker-health-report`, `docker-cleanup`, `docker-setup`.

### Changed

- SSH hosts share one SSH connection with several channels instead of opening one connection per request, which avoids `ECONNRESET` on bursts of parallel calls. The connection is reopened if it drops and closed after 60 s of inactivity.
- The server exits as soon as the MCP client disconnects.

### Fixed

- Listing containers failed when Docker returned `null` for `Ports`, `Names` or `Mounts`.

## 0.1.0

Initial release: multi-host Docker MCP server (local socket, TCP/TLS, SSH), read and write tools, per-host read-only mode.
