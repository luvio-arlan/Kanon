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
import { buildFallbackAnnualFacts, persistExtractedPitFacts } from "./sec-pit-sync";

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
  for (const f of snapshot.filings.slice(0, 10)) {
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
  for (const f of snapshot.filings.slice(0, 10)) {
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
  for (const job of prepared.fanout8kJobs) {
    await enqueueJob(tx, {
      id: `fanout_8k:${job.accessionNumber}`,
      kind: "fanout_8k",
      payload: { ...job },
      priority: 20,
      maxAttempts: 3,
    });
  }
}

/** Q5-11 atomic commit: writes security + filings + PIT facts + fanout_8k job FIRST and snapshot LAST. */
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

interface FanoutMessage {
  kind: "form8k_redflag" | "filing_redflag";
  severity: "critical" | "warn" | "info";
  title: string;
  body: string;
  sourceUrl: string;
}

function buildFanoutMessages(kind: string, payload: Record<string, unknown>): FanoutMessage[] {
  const ticker = String(payload.ticker ?? "");
  if (kind === "fanout_8k" && Array.isArray(payload.alerts)) {
    const acc = String(payload.accessionNumber ?? "");
    return payload.alerts.map((raw) => {
      const a = (raw ?? {}) as Record<string, unknown>;
      return {
        kind: "form8k_redflag" as const,
        severity: "critical" as const,
        title: `${ticker} 8-K 警示：${String(a.titleZh ?? "")}`,
        body: String(a.summaryZh ?? ""),
        sourceUrl: `8k:${acc}:${String(a.itemCode ?? "")}`,
      };
    });
  }
  if (kind !== "fanout_filing_redflag" || !Array.isArray(payload.redFlags)) return [];
  const form = String(payload.form ?? "");
  const docUrl = String(payload.documentUrl ?? "");
  return payload.redFlags.map((raw) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    const severity = f.severity === "critical" || f.severity === "warn" ? f.severity : "info";
    return {
      kind: "filing_redflag" as const,
      severity,
      title: `${ticker} ${form} 披露警示 · ${String(f.labelZh ?? "")}`,
      body: String(f.excerpt ?? ""),
      sourceUrl: `${docUrl}#redflag=${String(f.code ?? "")}`,
    };
  });
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
    const ids = [...new Set(watchers.map((w) => w.thesisId))];
    const recipients = await listEnabledForm8kAlertRecipients(tx, ids);
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

/** Drains due fanout jobs best-effort from `after()` inside `alert_fanout` system context. */
export async function drainAlertFanoutJobsBestEffort(maxJobs = 5): Promise<void> {
  const workerId = `fanout_${Date.now().toString(36)}`;
  const exclude = ["sync_daily_bars", "sync_sec", "embed_chunks", "evaluate_alerts", "noop"];
  for (let i = 0; i < maxJobs; i += 1) {
    const [job] = await withSystemDb("alert_fanout", (tx) =>
      claimDueJobs(tx, { workerId, limit: 1, leaseSeconds: 60, excludeKinds: exclude }),
    );
    if (!job) break;
    try {
      if (job.kind === "fanout_8k" || job.kind === "fanout_filing_redflag") {
        await executeAlertFanoutJobInSystemDb(job.kind, job.payload);
      }
      await withSystemDb("alert_fanout", (tx) => completeJob(tx, job.id, workerId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await withSystemDb("alert_fanout", (tx) => failJobWithBackoff(tx, job.id, msg, workerId));
    }
  }
}
