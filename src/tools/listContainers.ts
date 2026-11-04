import { z } from "zod";
import { defineHostTool } from "./toolkit.js";

/** `docker_list_containers`: lists containers, stopped ones included. */
export const listContainersTool = defineHostTool({
  name: "docker_list_containers",
  title: "List containers",
  description: "List containers (including stopped ones) with optional filters.",
  write: false,
  shape: {
    status: z
      .enum(["created", "running", "paused", "restarting", "exited", "removing", "dead"])
      .optional()
      .describe("Only containers in this state"),
    name: z.string().min(1).optional().describe("Only containers whose name contains this text"),
    label: z.string().min(1).optional().describe('Only containers with this label ("key" or "key=value")'),
  },
  run: (service, args) => service.listContainers(args),
});
