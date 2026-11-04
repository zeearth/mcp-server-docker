import { z } from "zod";
import { containerSchema, defineHostTool } from "./toolkit.js";

/** `docker_inspect`: reduced container description, or the full payload on request. */
export const inspectTool = defineHostTool({
  name: "docker_inspect",
  title: "Inspect a container",
  description:
    "Describe a container: state, image, ports, mounts, networks, command and environment " +
    "(sensitive values are masked). Set full=true for the complete Docker payload.",
  write: false,
  shape: {
    container: containerSchema,
    full: z.boolean().optional().describe("Return the complete inspect payload (large)"),
  },
  run: (service, args) => service.inspect(args.container, { full: args.full }),
});
