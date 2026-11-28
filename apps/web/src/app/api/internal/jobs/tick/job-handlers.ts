import { ECB_FX_CURRENCIES, fetchEcbReferenceFxRates } from "@kanon/ai";
import {
  findEarliestForeignLedgerDate,
  findFxBackfillStart,
  pruneOldAppErrorEvents,
  pruneStaleFilingChunks,
  type QueuedJobRow,
  resolvePendingGuidanceCommitments,
  upsertFxRates,
} from "@kanon/core/db";
import { withSystemDb } from "../../../_lib/db-context";
import { runSyncDailyBarsForTicker, runSyncSecForTicker } from "../../../_lib/on-demand-sync";
import { runBuildRedlineJob, runSyncSegmentsJob } from "../../../_lib/sec-intel-jobs";
import { executeAlertFanoutJobInSystemDb } from "../../../_lib/sec-warehouse-sync";
import { runExtractPressGuidanceJob } from "./segment-sync-job";

export const NON_ALERT_JOB_KINDS = [
  "sync_fx_rates",
  "sync_daily_bars",
  "sync_sec",
  "fanout_8k",
  "fanout_filing_redflag",
  "build_redline",
  "sync_segments",
  "extract_press_guidance",
  "resolve_guidance",
  "prune_chunks",
  "backfill_bars",
  "noop",
] as const;

/** Estimated execution budget per job kind (ms) used to prevent mid-job Vercel 60s kills (U0-2). */
export const JOB_COST_MS: Readonly<Record<string, number>> = {
  sync_fx_rates: 12_000,
  sync_daily_bars: 6_000,
  backfill_bars: 10_000,
  sync_sec: 25_000,
  build_redline: 30_000,
  sync_segments: 20_000,
  extract_press_guidance: 15_000,
  fanout_8k: 5_000,
  fanout_filing_redflag: 5_000,
  resolve_guidance: 5_000,
  prune_chunks: 5_000,
  noop: 1_000,
};

export function estimateJobCostMs(kind: string): number {
  return JOB_COST_MS[kind] ?? 5_000;
}

export type JobOutcome = "done" | { skipped: string };
export type JobRunner = (job: QueuedJobRow, signal: AbortSignal) => Promise<JobOutcome>;

const JOB_RUNNERS: Record<string, JobRunner> = {
  noop: async () => "done",
  sync_fx_rates: async (_job, signal) => {
    const today = new Date().toISOString().slice(0, 10);
    const startPeriod = await withSystemDb("cron_tick", async (tx) => {
      const earliest = await findEarliestForeignLedgerDate(tx);
      return findFxBackfillStart(tx, {
        currencies: ECB_FX_CURRENCIES,
        fromDate: earliest ?? today,
        today,
      });
    });
    const rows = await fetchEcbReferenceFxRates({ signal, startPeriod: startPeriod ?? undefined });
    if (rows.length > 0) {
      await withSystemDb("cron_tick", (tx) => upsertFxRates(tx, rows));
    }
    return "done";
  },
  fanout_8k: async (job) => {
    await executeAlertFanoutJobInSystemDb("fanout_8k", job.payload);
    return "done";
  },
  fanout_filing_redflag: async (job) => {
    await executeAlertFanoutJobInSystemDb("fanout_filing_redflag", job.payload);
    return "done";
  },
  sync_daily_bars: async (job, signal) => {
    await runSyncDailyBarsForTicker(String(job.payload.ticker ?? ""), {
      forceFullRebase: job.payload.forceFullRebase === true,
      signal,
    });
    return "done";
  },
  backfill_bars: async (job, signal) => {
    await runSyncDailyBarsForTicker(String(job.payload.ticker ?? ""), {
      forceFullRebase: true,
      signal,
    });
    return "done";
  },
  sync_sec: async (job, signal) => {
    const outcome = await runSyncSecForTicker(String(job.payload.ticker ?? ""), { signal });
    return outcome.status === "skipped" ? { skipped: outcome.reason } : "done";
  },
  build_redline: async (job, signal) => {
    await runBuildRedlineJob(job.payload, "cron_tick", signal);
    return "done";
  },
  sync_segments: async (job, signal) => {
    await runSyncSegmentsJob(job.payload, "cron_tick", signal);
    return "done";
  },
  extract_press_guidance: (job, signal) =>
    runExtractPressGuidanceJob(job.payload, "cron_tick", signal),
  resolve_guidance: async () => {
    await withSystemDb("cron_tick", (tx) => resolvePendingGuidanceCommitments(tx));
    return "done";
  },
  prune_chunks: async () => {
    await withSystemDb("cron_tick", async (tx) => {
      await pruneStaleFilingChunks(tx);
      await pruneOldAppErrorEvents(tx, 30);
    });
    return "done";
  },
};

/** Dispatches a single non-alert background job with an AbortSignal deadline (U0-2). */
export async function executeNonAlertJob(
  job: QueuedJobRow,
  signal: AbortSignal,
): Promise<JobOutcome> {
  const runner = JOB_RUNNERS[job.kind];
  if (!runner) throw new Error(`Unsupported job kind: ${job.kind}`);
  return runner(job, signal);
}
