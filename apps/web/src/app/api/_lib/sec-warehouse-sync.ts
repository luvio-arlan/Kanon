import { classifyForm8kItems, type ExtractedPitFact, scanFilingRedFlags } from "@kanon/ai";
import type { SecFilingReaderResponse, SecSnapshot } from "@kanon/core";
import {
  createInboxItem,
  getSecurityByTicker,
  type KanonDb,
  listThesisWatchersByTicker,
  upsertFiling,
  upsertFilingChunks,
  upsertFinancialFacts,
  upsertSecurity,
} from "@kanon/core/db";
import { buildFallbackAnnualFacts, persistExtractedPitFacts } from "./sec-pit-sync";

async function emitAlertToRecipients(
  db: KanonDb,
  recipients: ReadonlyMap<string, string | null>,
  ticker: string,
  filingUrl: string,
  alert: { itemCode: string; titleZh: string; summaryZh: string },
) {
  for (const [uid, thesisId] of recipients.entries()) {
    await createInboxItem(db, {
      userId: uid,
      thesisId,
      kind: "form8k_redflag",
      severity: "critical",
      title: `${ticker} 8-K 警示：${alert.titleZh}`,
      body: alert.summaryZh,
      sourceUrl: `${filingUrl}#${alert.itemCode}`,
    });
  }
}

async function fanOutForm8kAlerts(
  db: KanonDb,
  snapshot: SecSnapshot,
  triggerUserId?: string,
): Promise<void> {
  const watchers = await listThesisWatchersByTicker(db, snapshot.ticker);
  const recipients = new Map<string, string | null>();
  for (const w of watchers) recipients.set(w.userId, w.thesisId);
  if (triggerUserId && !recipients.has(triggerUserId)) recipients.set(triggerUserId, null);
  if (recipients.size === 0) return;

  for (const filing of snapshot.filings.slice(0, 10)) {
    if (!filing.form.startsWith("8-K")) continue;
    const criticals = classifyForm8kItems(filing.description ?? "").filter(
      (a) => a.severity === "critical",
    );
    for (const alert of criticals) {
      await emitAlertToRecipients(db, recipients, snapshot.ticker, filing.documentUrl, alert);
    }
  }
}

/** Persists a synced SEC snapshot + per-fact PIT records and fans out deduplicated 8-K alerts. */
export async function syncSecSnapshotToWarehouse(
  db: KanonDb,
  snapshot: SecSnapshot,
  userId?: string,
  pitFacts?: readonly ExtractedPitFact[],
): Promise<void> {
  const security = await upsertSecurity(db, {
    ticker: snapshot.ticker,
    cik: snapshot.cik,
    name: snapshot.entityName,
    currency: snapshot.reportingCurrency,
    adrRatio: snapshot.adrRatio,
  });

  for (const filing of snapshot.filings.slice(0, 10)) {
    await upsertFiling(db, {
      accession: filing.accessionNumber,
      securityId: security.id,
      cik: snapshot.cik,
      form: filing.form,
      filedAt: filing.filingDate,
      periodEnd: filing.reportDate ?? null,
      primaryDocUrl: filing.documentUrl,
      parseStatus: "synced",
    });
  }
  await fanOutForm8kAlerts(db, snapshot, userId);

  if (pitFacts && pitFacts.length > 0) {
    await persistExtractedPitFacts(db, security.id, snapshot.cik, pitFacts);
    return;
  }
  const fallbackFacts = buildFallbackAnnualFacts(security.id, snapshot);
  if (fallbackFacts.length > 0) await upsertFinancialFacts(db, fallbackFacts);
}

/** Indexes parsed 10-K/10-Q paragraphs into `filing_chunks` and scans for red-flag disclosures. */
export async function indexFilingDocChunks(
  db: KanonDb,
  doc: SecFilingReaderResponse,
): Promise<void> {
  if (!doc.accessionNumber || doc.sections.length === 0) return;
  const security = await getSecurityByTicker(db, doc.ticker);
  if (!security) return;
  await upsertFiling(db, {
    accession: doc.accessionNumber,
    securityId: security.id,
    cik: security.cik ?? "",
    form: doc.form,
    filedAt: doc.filingDate,
    primaryDocUrl: doc.documentUrl,
    parseStatus: "chunked",
  });
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
  if (chunks.length > 0) await upsertFilingChunks(db, chunks);
  const redFlags = scanFilingRedFlags(chunks.map((c) => c.text)).slice(0, 3);
  if (redFlags.length === 0) return;
  const watchers = await listThesisWatchersByTicker(db, doc.ticker);
  for (const flag of redFlags) {
    for (const w of watchers) {
      await createInboxItem(db, {
        userId: w.userId,
        thesisId: w.thesisId,
        kind: "filing_redflag",
        severity: flag.severity,
        title: `${doc.ticker} ${doc.form} 披露警示 · ${flag.labelZh}`,
        body: flag.excerpt,
        sourceUrl: `${doc.documentUrl}#redflag=${flag.code}`,
      });
    }
  }
}
