import {
  classifyForm8kItems,
  type ExtractedPitFact,
  parseForm8kItemCodes,
  scanFilingRedFlags,
} from "@kanon/ai";
import type { SecFilingReaderResponse, SecSnapshot } from "@kanon/core";
import {
  claimDueJobs,
  completeJob,
  createInboxItem,
  enqueueJob,
  failJobWithBackoff,
  getSecurityByTicker,
  type KanonDb,
  listEnabledForm8kAlertRecipients,
  listThesisWatchersByTicker,
  runInTransaction,
  upsertFiling,
  upsertFilingChunks,
  upsertFinancialFacts,
  upsertSecSnapshot,
  upsertSecurity,
} from "@kanon/core/db";
import { withSystemDb } from "./db-context";
import {
  buildFallbackAnnualFacts,
  buildFanoutMessages,
  persistExtractedPitFacts,
} from "./sec-pit-sync";

export interface PreparedSecCommit {
  snapshot: SecSnapshot;
  filingItemsByAcc: ReadonlyMap<string, string[]>;
  fanout8kJobs: Array<{
    ticker: string;
    accessionNumber: string;
    alerts: Array<{ itemCode: string; titleZh: string; summaryZh: string }>;
  }>;
}

export function prepareSecSnapshotCommit(snapshot: SecSnapshot): PreparedSecCommit {
  const filingItemsByAcc = new Map<string, string[]>();
  const fanout8kJobs: PreparedSecCommit["fanout8kJobs"] = [];
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  for (const f of snapshot.filings) {
    if (!f.form.startsWith("8-K")) continue;
    filingItemsByAcc.set(f.accessionNumber, parseForm8kItemCodes(f.description ?? ""));
    if (f.filingDate < cutoff) continue;
    const alerts = classifyForm8kItems(f.description ?? "")
      .filter((a) => a.severity === "critical")
      .map(({ itemCode, titleZh, summaryZh }) => ({ itemCode, titleZh, summaryZh }));
    if (alerts.length > 0) {
      fanout8kJobs.push({ ticker: snapshot.ticker, accessionNumber: f.accessionNumber, alerts });
    }
  }
  return { snapshot, filingItemsByAcc, fanout8kJobs };
}

/** Runs red-flag scan OUTSIDE DB transactions (G10 compliant). */
export function prepareFilingDocChunks(doc: SecFilingReaderResponse) {
  const chunks = doc.sections.flatMap((sec) =>
    sec.paragraphs.map((text, idx) => ({
      id: `${doc.accessionNumber}:${sec.id}:${idx}`,
      accession: doc.accessionNumber,
      ticker: doc.ticker,
      sectionCode: sec.id,
      paraIndex: idx,
      text,
    })),
  );
  const redFlags = scanFilingRedFlags(chunks.map((c) => c.text))
    .slice(0, 3)
    .map(({ code, labelZh, severity, excerpt }) => ({ code, labelZh, severity, excerpt }));
  return { chunks, redFlags };
}

async function enqueuePostCommitJobs(tx: KanonDb, prepared: PreparedSecCommit) {
  for (const job of prepared.fanout8kJobs) {
    await enqueueJob(tx, {
      id: `fanout_8k:${job.accessionNumber}`,
      kind: "fanout_8k",
      payload: { ...job },
      priority: 20,
      maxAttempts: 3,
    });
  }
  const target = prepared.snapshot.filings.find((f) => /^(?:10-K|10-Q|20-F)$/i.test(f.form));
  if (target) {
    for (const section of ["risk_factors", "mda"] as const) {
      await enqueueJob(tx, {
        id: `build_redline:${target.accessionNumber}:${section}`,
        kind: "build_redline",
        payload: { ticker: prepared.snapshot.ticker, accession: target.accessionNumber, section },
        priority: 40,
        maxAttempts: 3,
      });
    }
  }
  for (const f of prepared.snapshot.filings) {
    const items = prepared.filingItemsByAcc.get(f.accessionNumber) ?? [];
    if (!f.form.startsWith("8-K") || !items.includes("2.02")) continue;
    await enqueueJob(tx, {
      id: `extract_press_guidance:${f.accessionNumber}`,
      kind: "extract_press_guidance",
      payload: {
        ticker: prepared.snapshot.ticker,
        cik: prepared.snapshot.cik,
        accession: f.accessionNumber,
        issuedOn: f.filingDate,
      },
      priority: 55,
      maxAttempts: 3,
    });
  }
}

async function persistWarehouseData(
  tx: KanonDb,
  prepared: PreparedSecCommit,
  pitFacts?: readonly ExtractedPitFact[],
): Promise<void> {
  const { snapshot } = prepared;
  const security = await upsertSecurity(tx, {
    ticker: snapshot.ticker,
    cik: snapshot.cik,
    name: snapshot.entityName,
    currency: snapshot.reportingCurrency,
    adrRatio: snapshot.adrRatio,
    secStatus: "active",
  });
  for (const f of snapshot.filings) {
    await upsertFiling(tx, {
      accession: f.accessionNumber,
      securityId: security.id,
      cik: snapshot.cik,
      form: f.form,
      filedAt: f.filingDate,
      periodEnd: f.reportDate ?? null,
      items: prepared.filingItemsByAcc.get(f.accessionNumber) ?? [],
      primaryDocUrl: f.documentUrl,
      parseStatus: "synced",
    });
  }
  if (pitFacts?.length) await persistExtractedPitFacts(tx, security.id, snapshot.cik, pitFacts);
  else {
    const fallback = buildFallbackAnnualFacts(security.id, snapshot);
    if (fallback.length > 0) await upsertFinancialFacts(tx, fallback);
  }
  await enqueuePostCommitJobs(tx, prepared);
}

/** Q5-11 atomic commit: writes security + filings + PIT facts + jobs FIRST and snapshot LAST. */
export async function commitSecSnapshotAndWarehouseAtomic(
  db: KanonDb,
  prepared: PreparedSecCommit,
  pitFacts?: readonly ExtractedPitFact[],
): Promise<SecSnapshot> {
  return runInTransaction(db, async (tx) => {
    await persistWarehouseData(tx, prepared, pitFacts);
    return upsertSecSnapshot(tx, prepared.snapshot);
  });
}

/** Persists filing chunks and enqueues `fanout_filing_redflag:<accession>` (priority 20). */
export async function persistFilingDocChunksAndEnqueueFanout(
  db: KanonDb,
  doc: SecFilingReaderResponse,
  prepared: ReturnType<typeof prepareFilingDocChunks>,
): Promise<boolean> {
  if (!doc.accessionNumber || prepared.chunks.length === 0) return false;
  const security = await getSecurityByTicker(db, doc.ticker);
  if (!security) return false;
  await upsertFiling(db, {
    accession: doc.accessionNumber,
    securityId: security.id,
    cik: security.cik ?? "",
    form: doc.form,
    filedAt: doc.filingDate,
    primaryDocUrl: doc.documentUrl,
    parseStatus: "chunked",
  });
  await upsertFilingChunks(db, prepared.chunks);
  if (prepared.redFlags.length === 0) return false;
  const { ticker, form, accessionNumber, documentUrl } = doc;
  const enq = await enqueueJob(db, {
    id: `fanout_filing_redflag:${accessionNumber}`,
    kind: "fanout_filing_redflag",
    payload: { ticker, form, accessionNumber, documentUrl, redFlags: prepared.redFlags },
    priority: 20,
    maxAttempts: 3,
  });
  return enq.inserted;
}

/** Executes a `fanout_8k` or `fanout_filing_redflag` job inside `alert_fanout` system context. */
export async function executeAlertFanoutJobInSystemDb(
  kind: "fanout_8k" | "fanout_filing_redflag",
  payload: Record<string, unknown>,
): Promise<number> {
  const ticker = String(payload.ticker ?? "");
  const messages = buildFanoutMessages(kind, payload);
  if (!ticker || messages.length === 0) return 0;
  return withSystemDb("alert_fanout", async (tx) => {
    const watchers = await listThesisWatchersByTicker(tx, ticker);
    if (watchers.length === 0) return 0;
    const recipients = await listEnabledForm8kAlertRecipients(tx, [
      ...new Set(watchers.map((w) => w.thesisId)),
    ]);
    let delivered = 0;
    for (const msg of messages) {
      for (const r of recipients) {
        await createInboxItem(tx, { userId: r.userId, thesisId: r.thesisId, ...msg });
        delivered += 1;
      }
    }
    return delivered;
  });
}

export async function drainAlertFanoutJobsBestEffort(maxJobs = 5): Promise<void> {
  const workerId = `fanout_${Date.now().toString(36)}`;
  const excludeKinds = [
    "sync_daily_bars",
    "sync_sec",
    "build_redline",
    "sync_segments",
    "resolve_guidance",
    "prune_chunks",
    "backfill_bars",
    "evaluate_alerts",
    "noop",
  ];
  for (let i = 0; i < maxJobs; i += 1) {
    const [job] = await withSystemDb("alert_fanout", (tx) =>
      claimDueJobs(tx, { workerId, limit: 1, leaseSeconds: 60, excludeKinds }),
    );
    if (!job) break;
    try {
      if (job.kind === "fanout_8k" || job.kind === "fanout_filing_redflag")
        await executeAlertFanoutJobInSystemDb(job.kind, job.payload);
      await withSystemDb("alert_fanout", (tx) => completeJob(tx, job.id, workerId));
    } catch (err) {
      await withSystemDb("alert_fanout", (tx) =>
        failJobWithBackoff(tx, job.id, err instanceof Error ? err.message : String(err), workerId),
      );
    }
  }
}
