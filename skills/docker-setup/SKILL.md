---
name: docker-setup
description: Help configure and troubleshoot the docker MCP server's hosts file (hosts.json), especially ssh:// hosts such as a NAS. Use when the user wants to add a Docker host, or sees errors like "SSH authentication failed", "SSH host key verification failed", "Cannot reach the Docker daemon", or "docker: not found".
---

# Configuring Docker hosts

The server reads a JSON file given by `--config` (or `MCP_DOCKER_CONFIG`). Keep it outside any repository, for example `~/.config/mcp-server-docker/hosts.json`. It holds paths to key files, never the keys or passwords themselves.

## Format

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

- `readOnly`: start with `true` for any new remote host and relax it later.
- `dockerCommand` and `identityFile` only apply to `ssh://` hosts. TLS hosts use `ca`, `cert` and `key` file paths.
- Host names may only use letters, digits, `-` and `_`.

## Adding an SSH host, step by step

Never print or read the contents of a private key. Only deal with paths.

1. **Port and key**: the server does not read `~/.ssh/config`. If the user already connects with `ssh`, get the real values with `ssh -G <alias-or-host> | grep -iE '^(hostname|port|user|identityfile) '` and copy them into the URL and `identityFile`.
2. **Remote docker binary**: non-interactive SSH sessions often lack docker in `PATH`. Check with `ssh -o BatchMode=yes <user>@<host> 'command -v docker'`. If that prints nothing, look in `/usr/local/bin/docker` (Synology) and set `dockerCommand` to the full path.
3. **Permission**: the user must be allowed to run docker. `ssh <user>@<host> '<dockerCommand> version'` must print a server version, not a permission error.
4. **Host key**: the server only trusts hosts already in `~/.ssh/known_hosts`. For a non-default port the entry is under `[host]:port`: check with `ssh-keygen -F '[host]:port'`. If missing, the user connects once with `ssh -p <port> user@host` and accepts the key. Do not add keys automatically.
5. **Test**: call `docker_list_hosts`, then `docker_list_containers` with `host` set to the new name.

## Reading the error messages

| Message | Likely cause and fix |
|---|---|
| `SSH authentication failed` | The key is not in the ssh-agent and no `identityFile` is set, the key file has a passphrase (not supported: use the agent), or the user name is wrong. |
| `SSH host key verification failed` | Host not in `known_hosts`, wrong port in the URL (the entry is stored per port), or the host key really changed. Treat a changed key as a security question and ask the user before proceeding. |
| `Cannot reach the Docker daemon` | Local: Docker is not running, or the socket path or permissions are wrong. TCP: wrong host or port, or the daemon does not listen there. |
| `Host unreachable` | Network, firewall, DNS, or the wrong port. |
| `Permission denied by the Docker daemon` | The user is not in the `docker` group on that machine. |
| `sh: docker: not found` (in ssh output) | Set `dockerCommand` to the absolute path. |
| `Unknown host` | The name is not in the hosts file: the message lists the configured ones. |

## After editing the file

The server reads the file at startup. The user must restart the MCP server (in Claude Code, reconnect it from `/mcp` or start a new session).
