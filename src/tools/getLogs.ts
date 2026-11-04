import { z } from "zod";
import { DEFAULT_TAIL, MAX_TAIL } from "../docker/DockerService.js";
import { containerSchema, defineHostTool } from "./toolkit.js";

/** `docker_get_logs`: reads the end of a container's logs, split by stream. */
export const getLogsTool = defineHostTool({
  name: "docker_get_logs",
  title: "Get container logs",
  description: "Read the most recent logs of a container, with stdout and stderr separated. Output is size-capped.",
  write: false,
  shape: {
    container: containerSchema,
    tail: z.number().int().min(1).max(MAX_TAIL).optional().describe(`Number of lines (default ${DEFAULT_TAIL})`),
    since: z.string().min(1).optional().describe('Only logs after this point: "10m", "2h", "1d" or an ISO date'),
  },
  run: (service, args) => service.getLogs(args.container, { tail: args.tail, since: args.since }),
});
