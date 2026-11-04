interface RawCpu {
  cpu_usage?: { total_usage?: number };
  system_cpu_usage?: number;
  online_cpus?: number;
}

/** Subset of the Docker stats payload that we read. */
export interface RawStats {
  cpu_stats?: RawCpu;
  precpu_stats?: RawCpu;
  memory_stats?: { usage?: number; limit?: number; stats?: Record<string, number> };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  pids_stats?: { current?: number };
}

/** Human-friendly snapshot computed from a raw stats payload. */
export interface StatsSnapshot {
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  pids: number;
}

/**
 * Rounds to two decimals.
 * @param value Number to round.
 * @returns The rounded number.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes the CPU usage percentage between the two samples of a stats payload.
 * @param raw Raw Docker stats.
 * @returns CPU percent (can exceed 100 on multi-core), 0 when no delta is available.
 */
function computeCpuPercent(raw: RawStats): number {
  const cpuDelta = (raw.cpu_stats?.cpu_usage?.total_usage ?? 0) - (raw.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta = (raw.cpu_stats?.system_cpu_usage ?? 0) - (raw.precpu_stats?.system_cpu_usage ?? 0);
  if (cpuDelta <= 0 || systemDelta <= 0) {
    return 0;
  }
  const cpuCount = raw.cpu_stats?.online_cpus ?? 1;
  return round2((cpuDelta / systemDelta) * cpuCount * 100);
}

/**
 * Turns a raw Docker stats payload into a compact snapshot.
 * Memory excludes reclaimable page cache, like `docker stats` does.
 * @param raw Raw Docker stats (a one-shot, non-streamed sample).
 * @returns The computed snapshot; missing fields count as 0.
 */
export function computeStats(raw: RawStats): StatsSnapshot {
  const memory = raw.memory_stats ?? {};
  const reclaimable = memory.stats?.inactive_file ?? memory.stats?.cache ?? 0;
  const usage = Math.max((memory.usage ?? 0) - reclaimable, 0);
  const limit = memory.limit ?? 0;
  let rxBytes = 0;
  let txBytes = 0;
  for (const network of Object.values(raw.networks ?? {})) {
    rxBytes += network.rx_bytes ?? 0;
    txBytes += network.tx_bytes ?? 0;
  }
  return {
    cpuPercent: computeCpuPercent(raw),
    memoryUsageBytes: usage,
    memoryLimitBytes: limit,
    memoryPercent: limit > 0 ? round2((usage / limit) * 100) : 0,
    networkRxBytes: rxBytes,
    networkTxBytes: txBytes,
    pids: raw.pids_stats?.current ?? 0,
  };
}
