import { z } from "zod";
import { containerSchema, defineHostTool } from "./toolkit.js";

/** `docker_rm`: removes one container. Force and volume removal are explicit opt-ins. */
export const rmTool = defineHostTool({
  name: "docker_rm",
  title: "Remove a container",
  description:
    "Permanently remove one container by name or id. By default only stopped containers are removed " +
    "and volumes are kept. Needs an explicit host when several hosts are configured.",
  write: true,
  destructive: true,
  shape: {
    container: containerSchema,
    force: z.boolean().optional().describe("Also remove a running container (default false)"),
    volumes: z.boolean().optional().describe("Also remove its anonymous volumes (default false)"),
  },
  run: (service, args) => service.remove(args.container, { force: args.force, volumes: args.volumes }),
});
