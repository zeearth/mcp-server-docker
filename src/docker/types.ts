import type { StatsSnapshot } from "../../toolbox/stats.js";

/** One row of the container listing. */
export interface ContainerSummary {
  id: string;
  names: string[];
  image: string;
  state: string;
  status: string;
  ports: string[];
  created: string;
}

/** Filters accepted when listing containers. Stopped containers are always included. */
export interface ListFilters {
  status?: string;
  name?: string;
  label?: string;
}

/** Options for reading logs. */
export interface LogsOptions {
  tail?: number;
  since?: string;
  maxBytes?: number;
}

/** Demultiplexed and size-limited logs. */
export interface LogsResult {
  stdout: string;
  stderr: string;
  tail: number;
  truncated: boolean;
}

/** Options for `inspect`. */
export interface InspectOptions {
  full?: boolean;
}

/** Container statistics snapshot with the container reference. */
export interface ContainerStatsResult extends StatsSnapshot {
  container: string;
}

/** Result of a write operation. "unchanged" means the container was already in the target state. */
export interface ActionResult {
  container: string;
  action: "start" | "stop" | "restart" | "remove";
  outcome: "done" | "unchanged";
}

/** Options for stop and restart. */
export interface StopOptions {
  timeoutSeconds?: number;
}

/** Options for remove. Both flags are opt-in and never default to true. */
export interface RemoveOptions {
  force?: boolean;
  volumes?: boolean;
}
