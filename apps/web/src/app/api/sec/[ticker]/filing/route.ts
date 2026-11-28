import { fetchSecEdgarSnapshot, fetchSecFilingReaderData } from "@kanon/ai";
import {
  getCachedSecFilingDoc,
  getSecSnapshotForUser,
  type KanonDb,
  upsertCachedSecFilingDoc,
  upsertSecSnapshot,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { withSystemDb } from "../../../_lib/db-context";
import { jsonError, jsonOk } from "../../../_lib/http";
import { checkPersistentRateLimit } from "../../../_lib/request-guards";
import {
  drainAlertFanoutJobsBestEffort,
  persistFilingDocChunksAndEnqueueFanout,
  prepareFilingDocChunks,
} from "../../../_lib/sec-warehouse-sync";
import { scheduleBackgroundAfterTask } from "../../../internal/jobs/tick/job-once";

export const dynamic = "force-dynamic";

const SEC_FILING_RATE_POLICY = {
  bucket: "sec_filing_reader",
  maxRequests: 25,
  windowMs: 60 * 1000,
};

function resolveTargetAccession(
  filings: readonly { accessionNumber: string; form: string }[],
  accessionNumber?: string,
  form?: string,
): string | null {
  if (accessionNumber) return accessionNumber;
  if (form) {
    return (
      filings.find((f) => f.form.toUpperCase() === form.toUpperCase())?.accessionNumber ?? null
    );
  }
  const primary = filings.find((f) => f.form === "10-K" || f.form === "10-Q" || f.form === "20-F");
  return primary?.accessionNumber ?? filings[0]?.accessionNumber ?? null;
}

async function loadFilingWithCache(params: {
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>;
  userId: string;
  cleanTicker: string;
  accessionNumber?: string;
  form?: string;
  refresh: boolean;
}) {
  let snapshot = await params.withDb((tx) =>
    getSecSnapshotForUser(tx, params.cleanTicker, params.userId),
  );
  if (!snapshot) {
    const liveSnap = await fetchSecEdgarSnapshot(params.cleanTicker);
    if (liveSnap.ok) {
      snapshot = await withSystemDb("user_triggered_sync", (tx) =>
        upsertSecSnapshot(tx, liveSnap.data),
      );
    }
  }
  const targetAcc = resolveTargetAccession(
    snapshot?.filings ?? [],
    params.accessionNumber,
    params.form,
  );
  if (targetAcc && !params.refresh) {
    const cachedDoc = await params.withDb((tx) => getCachedSecFilingDoc(tx, targetAcc));
    if (cachedDoc && cachedDoc.ticker.toUpperCase() === params.cleanTicker) {
      return { readerData: cachedDoc, shouldDrainFanout: false };
    }
  }
  const readerData = await fetchSecFilingReaderData({
    ticker: params.cleanTicker,
    snapshot,
    accessionNumber: params.accessionNumber,
    form: params.form,
  });
  let shouldDrainFanout = false;
  if (readerData.source === "sec-edgar-live") {
    const prepared = prepareFilingDocChunks(readerData);
    shouldDrainFanout = await withSystemDb("user_triggered_sync", async (tx) => {
      await upsertCachedSecFilingDoc(tx, readerData);
      return persistFilingDocChunksAndEnqueueFanout(tx, readerData, prepared).catch(() => false);
    });
  }
  return { readerData, shouldDrainFanout };
}

export async function GET(request: Request, context: { params: Promise<{ ticker: string }> }) {
  const startedAt = performance.now();
  const rateErr = await checkPersistentRateLimit(request, SEC_FILING_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const { ticker } = await context.params;
  const cleanTicker = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) {
    return jsonError("无效的美股代码。", 400, startedAt, "INVALID_TICKER");
  }

  const url = new URL(request.url);
  const { readerData, shouldDrainFanout } = await loadFilingWithCache({
    withDb: auth.withDb,
    userId: auth.user.id,
    cleanTicker,
    accessionNumber: url.searchParams.get("accession")?.trim() || undefined,
    form: url.searchParams.get("form")?.trim() || undefined,
    refresh: url.searchParams.get("refresh") === "1",
  });
  if (shouldDrainFanout) {
    scheduleBackgroundAfterTask("/api/sec/[ticker]/filing", () =>
      drainAlertFanoutJobsBestEffort(2),
    );
  }
  return jsonOk(readerData, startedAt);
}
