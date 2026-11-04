import { z } from "zod";
import { containerSchema, defineHostTool } from "./toolkit.js";

/** `docker_stop`: gracefully stops a running container. */
export const stopTool = defineHostTool({
  name: "docker_stop",
  title: "Stop a container",
  description: "Stop a running container. Needs an explicit host when several hosts are configured.",
  write: true,
  idempotent: true,
  shape: {
    container: containerSchema,
    timeoutSeconds: z.number().int().min(0).max(300).optional().describe("Seconds to wait before killing"),
  },
  run: (service, args) => service.stop(args.container, { timeoutSeconds: args.timeoutSeconds }),
});
