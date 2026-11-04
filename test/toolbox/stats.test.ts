import { describe, expect, it } from "vitest";
import { computeStats } from "../../toolbox/stats.js";

describe("computeStats", () => {
  it("computes cpu, memory (without cache), network and pids", () => {
    const result = computeStats({
      cpu_stats: { cpu_usage: { total_usage: 300 }, system_cpu_usage: 2000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
      memory_stats: { usage: 600, limit: 1000, stats: { inactive_file: 100 } },
      networks: { eth0: { rx_bytes: 10, tx_bytes: 5 }, eth1: { rx_bytes: 1, tx_bytes: 2 } },
      pids_stats: { current: 7 },
    });
    expect(result).toEqual({
      cpuPercent: 40,
      memoryUsageBytes: 500,
      memoryLimitBytes: 1000,
      memoryPercent: 50,
      networkRxBytes: 11,
      networkTxBytes: 7,
      pids: 7,
    });
  });

  it("returns zeros for an empty payload", () => {
    expect(computeStats({})).toEqual({
      cpuPercent: 0,
      memoryUsageBytes: 0,
      memoryLimitBytes: 0,
      memoryPercent: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      pids: 0,
    });
  });
});
