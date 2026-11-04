import { z } from "zod";
import { containerSchema, defineHostTool } from "./toolkit.js";

/** `docker_restart`: restarts a container. */
export const restartTool = defineHostTool({
  name: "docker_restart",
  title: "Restart a container",
  description: "Restart a container. Needs an explicit host when several hosts are configured.",
  write: true,
  shape: {
    container: containerSchema,
    timeoutSeconds: z.number().int().min(0).max(300).optional().describe("Seconds to wait before killing"),
  },
  run: (service, args) => service.restart(args.container, { timeoutSeconds: args.timeoutSeconds }),
});
