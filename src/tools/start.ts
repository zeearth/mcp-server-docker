import { containerSchema, defineHostTool } from "./toolkit.js";

/** `docker_start`: starts a stopped container. */
export const startTool = defineHostTool({
  name: "docker_start",
  title: "Start a container",
  description: "Start a stopped container. Needs an explicit host when several hosts are configured.",
  write: true,
  idempotent: true,
  shape: { container: containerSchema },
  run: (service, args) => service.start(args.container),
});
