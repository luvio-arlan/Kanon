import type { QueuedJobRow } from "@kanon/core/db";
import { runSyncDailyBarsForTicker, runSyncSecForTicker } from "../../../_lib/on-demand-sync";
import { runBuildRedlineJob, runSyncSegmentsJob } from "../../../_lib/sec-intel-jobs";
import { executeAlertFanoutJobInSystemDb } from "../../../_lib/sec-warehouse-sync";

export const NON_ALERT_JOB_KINDS = [
  "sync_daily_bars",
  "sync_sec",
  "fanout_8k",
  "fanout_filing_redflag",
  "build_redline",
  "sync_segments",
  "resolve_guidance",
  "prune_chunks",
  "backfill_bars",
  "noop",
] as const;

type JobOutcome = "done" | { skipped: string };
type JobRunner = (job: QueuedJobRow) => Promise<JobOutcome>;

const JOB_RUNNERS: Record<string, JobRunner> = {
  noop: async () => "done",
  fanout_8k: async (job) => {
    await executeAlertFanoutJobInSystemDb("fanout_8k", job.payload);
    return "done";
  },
  fanout_filing_redflag: async (job) => {
    await executeAlertFanoutJobInSystemDb("fanout_filing_redflag", job.payload);
    return "done";
  },
  sync_daily_bars: async (job) => {
    await runSyncDailyBarsForTicker(String(job.payload.ticker ?? ""), {
      forceFullRebase: job.payload.forceFullRebase === true,
    });
    return "done";
  },
  backfill_bars: async (job) => {
    await runSyncDailyBarsForTicker(String(job.payload.ticker ?? ""), { forceFullRebase: true });
    return "done";
  },
  sync_sec: async (job) => {
    const outcome = await runSyncSecForTicker(String(job.payload.ticker ?? ""));
    return outcome.status === "skipped" ? { skipped: outcome.reason } : "done";
  },
  build_redline: async (job) => {
    await runBuildRedlineJob(job.payload, "cron_tick");
    return "done";
  },
  sync_segments: async (job) => {
    await runSyncSegmentsJob(job.payload, "cron_tick");
    return "done";
  },
  resolve_guidance: async () => ({ skipped: "disabled_pending_u0" }),
  prune_chunks: async () => ({ skipped: "disabled_pending_u0" }),
};

/** Dispatches a single non-alert background job in cron tick (R1/R2/R3/S1). */
export async function executeNonAlertJob(job: QueuedJobRow): Promise<JobOutcome> {
  const runner = JOB_RUNNERS[job.kind];
  if (!runner) throw new Error(`Unsupported job kind: ${job.kind}`);
  return runner(job);
}
