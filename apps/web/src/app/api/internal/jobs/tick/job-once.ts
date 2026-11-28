import crypto from "node:crypto";
import {
  claimJobById,
  completeJob,
  enqueueJob,
  failJobWithBackoff,
  type QueuedJobRow,
} from "@kanon/core/db";
import { after } from "next/server";
import { withSystemDb } from "../../../_lib/db-context";
import { generateRequestId, logStructuredApiEvent } from "../../../_lib/logger";

const AFTER_JOB_TIMEOUT_MS = 45_000;

export interface ScheduleJobOnceSpec {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  run: (signal: AbortSignal) => Promise<void>;
}

/**
 * Sole gateway allowed to invoke Next.js `after()` (enforced by G25).
 * Enqueues and atomically leases the job by ID so concurrent page polls and Cron ticks
 * never trigger duplicate downloads or leave failed jobs permanently `pending` (U0-4).
 */
export async function scheduleJobOnce(spec: ScheduleJobOnceSpec): Promise<{
  claimed: boolean;
  job: QueuedJobRow | null;
}> {
  const workerId = `ondemand_${crypto.randomUUID().slice(0, 8)}`;
  const claimed = await withSystemDb("user_triggered_sync", async (tx) => {
    await enqueueJob(tx, {
      id: spec.id,
      kind: spec.kind,
      payload: spec.payload,
      priority: spec.priority ?? 35,
      maxAttempts: spec.maxAttempts ?? 3,
    });
    return claimJobById(tx, { jobId: spec.id, workerId, leaseSeconds: 120 });
  });
  if (!claimed) return { claimed: false, job: null };

  const startedAt = performance.now();
  const execute = async () => {
    const signal = AbortSignal.timeout(AFTER_JOB_TIMEOUT_MS);
    try {
      await spec.run(signal);
      await withSystemDb("user_triggered_sync", (tx) => completeJob(tx, spec.id, workerId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await withSystemDb("user_triggered_sync", (tx) =>
        failJobWithBackoff(tx, spec.id, msg, workerId),
      ).catch(() => undefined);
      logStructuredApiEvent({
        level: "warn",
        requestId: generateRequestId(),
        route: `/api/internal/jobs/${spec.kind}`,
        status: 500,
        durationMs: Math.round(performance.now() - startedAt),
        code: spec.kind,
        message: msg,
      });
    }
  };
  try {
    after(execute);
  } catch {
    void execute();
  }
  return { claimed: true, job: claimed };
}

/** Runs a non-leased best-effort background task via Next.js `after()` with structured warning logs (G25). */
export function scheduleBackgroundAfterTask(label: string, task: () => Promise<void>): void {
  const startedAt = performance.now();
  const run = async () => {
    try {
      await task();
    } catch (err) {
      logStructuredApiEvent({
        level: "warn",
        requestId: generateRequestId(),
        route: label,
        status: 500,
        durationMs: Math.round(performance.now() - startedAt),
        code: "BACKGROUND_TASK_FAILED",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
