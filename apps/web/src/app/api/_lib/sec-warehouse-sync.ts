import { classifyForm8kItems, type ExtractedPitFact } from "@kanon/ai";
import type { SecFilingReaderResponse, SecSnapshot } from "@kanon/core";
import {
  createInboxItem,
  getSecurityByTicker,
  type KanonDb,
  listThesisWatchersByTicker,
  type UpsertFinancialFactInput,
  upsertFiling,
  upsertFilingChunks,
  upsertFinancialFacts,
  upsertSecurity,
} from "@kanon/core/db";

const ANNUAL_CONCEPTS = [
  { field: "revenue" as const, concept: "revenue", xbrlTag: "Revenues", unit: "USD" },
  { field: "grossProfit" as const, concept: "gross_profit", xbrlTag: "GrossProfit", unit: "USD" },
  { field: "netIncome" as const, concept: "net_income", xbrlTag: "NetIncomeLoss", unit: "USD" },
  {
    field: "operatingCashFlow" as const,
    concept: "operating_cash_flow",
    xbrlTag: "NetCashProvidedByUsedInOperatingActivities",
    unit: "USD",
  },
  {
    field: "capex" as const,
    concept: "capex",
    xbrlTag: "PaymentsToAcquirePropertyPlantAndEquipment",
    unit: "USD",
  },
  {
    field: "dilutedEps" as const,
    concept: "diluted_eps",
    xbrlTag: "EarningsPerShareDiluted",
    unit: "USD/shares",
  },
];

function matchAnnualFiling(snapshot: SecSnapshot, periodEnd: string) {
  const yearPrefix = periodEnd.slice(0, 4);
  const annualForms = snapshot.filings.filter((f) => f.form === "10-K" || f.form === "20-F");
  return (
    annualForms.find((f) => f.reportDate === periodEnd) ??
    annualForms.find((f) => f.reportDate?.startsWith(yearPrefix)) ??
    annualForms[0] ??
    snapshot.filings[0]
  );
}

function appendAnnualFactRows(
  rows: UpsertFinancialFactInput[],
  securityId: string,
  snapshot: SecSnapshot,
  annual: SecSnapshot["annuals"][number],
) {
  const periodEnd = annual.periodEndDate;
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return;
  const filing = matchAnnualFiling(snapshot, periodEnd);
  if (!filing?.accessionNumber || !filing.filingDate) return;
  const yearMatch = annual.fiscalYear.match(/\d{4}/);
  const fiscalYear = yearMatch ? Number(yearMatch[0]) : null;
  for (const spec of ANNUAL_CONCEPTS) {
    const val = annual[spec.field];
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    rows.push({
      id: `${securityId}:${filing.accessionNumber}:${spec.concept}:${periodEnd}:annual`,
      securityId,
      accession: filing.accessionNumber,
      concept: spec.concept,
      xbrlTag: spec.xbrlTag,
      periodEnd,
      duration: "annual",
      fiscalYear,
      fiscalPeriod: "FY",
      value: val,
      unit: spec.unit,
      currency: snapshot.reportingCurrency,
      filedAt: filing.filingDate,
    });
  }
}

function buildFallbackAnnualFacts(
  securityId: string,
  snapshot: SecSnapshot,
): UpsertFinancialFactInput[] {
  const rows: UpsertFinancialFactInput[] = [];
  for (const annual of snapshot.annuals) {
    appendAnnualFactRows(rows, securityId, snapshot, annual);
  }
  return rows;
}

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

async function persistExtractedPitFacts(
  db: KanonDb,
  securityId: string,
  cik: string,
  pitFacts: readonly ExtractedPitFact[],
): Promise<void> {
  const seenAccns = new Set<string>();
  const rows: UpsertFinancialFactInput[] = [];
  for (const f of pitFacts) {
    if (!seenAccns.has(f.accession)) {
      seenAccns.add(f.accession);
      await upsertFiling(db, {
        accession: f.accession,
        securityId,
        cik,
        form: f.form,
        filedAt: f.filedAt,
        periodEnd: f.periodEnd,
        fiscalYear: f.fiscalYear,
        fiscalPeriod: f.fiscalPeriod,
        primaryDocUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accession.replaceAll("-", "")}/`,
        parseStatus: "pit-synced",
      });
    }
    rows.push({
      id: `${securityId}:${f.accession}:${f.concept}:${f.periodEnd}:${f.duration}`,
      securityId,
      accession: f.accession,
      concept: f.concept,
      xbrlTag: f.xbrlTag,
      taxonomy: f.taxonomy,
      periodStart: f.periodStart,
      periodEnd: f.periodEnd,
      duration: f.duration,
      fiscalYear: f.fiscalYear,
      fiscalPeriod: f.fiscalPeriod,
      value: f.value,
      unit: f.unit,
      currency: f.currency,
      filedAt: f.filedAt,
    });
  }
  if (rows.length > 0) await upsertFinancialFacts(db, rows);
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

/** Indexes parsed 10-K/10-Q paragraphs into `filing_chunks` without overwriting security master. */
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
}
