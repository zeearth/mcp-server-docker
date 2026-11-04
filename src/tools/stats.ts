import { containerSchema, defineHostTool } from "./toolkit.js";

/** `docker_stats`: one-shot resource usage snapshot. */
export const statsTool = defineHostTool({
  name: "docker_stats",
  title: "Container stats",
  description: "One-shot snapshot of a running container: CPU %, memory, network and process count.",
  write: false,
  shape: { container: containerSchema },
  run: (service, args) => service.stats(args.container),
});
