import { classifyForm8kItems } from "@kanon/ai";
import type { SecFilingReaderResponse, SecSnapshot } from "@kanon/core";
import {
  createInboxItem,
  type KanonDb,
  type UpsertFinancialFactInput,
  upsertFiling,
  upsertFilingChunks,
  upsertFinancialFacts,
  upsertSecurity,
} from "@kanon/core/db";

const ANNUAL_CONCEPTS: readonly {
  field: "revenue" | "grossProfit" | "netIncome" | "operatingCashFlow" | "capex" | "dilutedEps";
  concept: string;
  xbrlTag: string;
  unit: string;
}[] = [
  { field: "revenue", concept: "revenue", xbrlTag: "Revenues", unit: "USD" },
  { field: "grossProfit", concept: "gross_profit", xbrlTag: "GrossProfit", unit: "USD" },
  { field: "netIncome", concept: "net_income", xbrlTag: "NetIncomeLoss", unit: "USD" },
  {
    field: "operatingCashFlow",
    concept: "operating_cash_flow",
    xbrlTag: "NetCashProvidedByUsedInOperatingActivities",
    unit: "USD",
  },
  {
    field: "capex",
    concept: "capex",
    xbrlTag: "PaymentsToAcquirePropertyPlantAndEquipment",
    unit: "USD",
  },
  {
    field: "dilutedEps",
    concept: "diluted_eps",
    xbrlTag: "EarningsPerShareDiluted",
    unit: "USD/shares",
  },
];

function buildAnnualFactRows(
  securityId: string,
  accession: string,
  filedAt: string,
  snapshot: SecSnapshot,
): UpsertFinancialFactInput[] {
  const rows: UpsertFinancialFactInput[] = [];
  for (const annual of snapshot.annuals) {
    const yearMatch = annual.fiscalYear.match(/\d{4}/);
    const fiscalYear = yearMatch ? Number(yearMatch[0]) : null;
    const periodEnd = fiscalYear ? `${fiscalYear}-12-31` : annual.fiscalYear;
    for (const spec of ANNUAL_CONCEPTS) {
      const val = annual[spec.field];
      if (typeof val !== "number" || !Number.isFinite(val)) continue;
      rows.push({
        id: `${securityId}:${accession}:${spec.concept}:${periodEnd}`,
        securityId,
        accession,
        concept: spec.concept,
        xbrlTag: spec.xbrlTag,
        periodEnd,
        duration: "annual",
        fiscalYear,
        fiscalPeriod: "FY",
        value: val,
        unit: spec.unit,
        currency: snapshot.reportingCurrency,
        filedAt,
      });
    }
  }
  return rows;
}

/** Persists a synced SEC snapshot into PIT warehouse tables and emits 8-K red-flag inbox alerts. */
export async function syncSecSnapshotToWarehouse(
  db: KanonDb,
  snapshot: SecSnapshot,
  userId: string,
): Promise<void> {
  const security = await upsertSecurity(db, {
    ticker: snapshot.ticker,
    cik: snapshot.cik,
    name: snapshot.entityName,
    currency: snapshot.reportingCurrency,
    adrRatio: snapshot.adrRatio,
  });

  const primaryFiling = snapshot.filings[0];
  for (const filing of snapshot.filings.slice(0, 8)) {
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
    if (filing.form.startsWith("8-K")) {
      const alerts = classifyForm8kItems(filing.description ?? "");
      for (const alert of alerts.filter((a) => a.severity === "critical")) {
        await createInboxItem(db, {
          userId,
          kind: "form8k_redflag",
          severity: "critical",
          title: `${snapshot.ticker} 8-K 警示：${alert.titleZh}`,
          body: alert.summaryZh,
          sourceUrl: filing.documentUrl,
        });
      }
    }
  }

  if (primaryFiling) {
    const factRows = buildAnnualFactRows(
      security.id,
      primaryFiling.accessionNumber,
      primaryFiling.filingDate,
      snapshot,
    );
    if (factRows.length > 0) await upsertFinancialFacts(db, factRows);
  }
}

/** Indexes parsed 10-K/10-Q paragraphs into `filing_chunks` for hybrid retrieval. */
export async function indexFilingDocChunks(
  db: KanonDb,
  doc: SecFilingReaderResponse,
): Promise<void> {
  if (!doc.accessionNumber || doc.sections.length === 0) return;
  const security = await upsertSecurity(db, {
    ticker: doc.ticker,
    name: doc.ticker,
  });
  await upsertFiling(db, {
    accession: doc.accessionNumber,
    securityId: security.id,
    cik: "INDEXED",
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
