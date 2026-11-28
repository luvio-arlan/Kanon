import { formatCompactMoney } from "@kanon/ai";
import {
  type SecFinancialFact,
  SecSnapshotSchema,
  type UpsertManualSecSnapshotSchema,
} from "@kanon/core";
import { getSecSnapshot, type KanonDb, upsertUserSecOverride } from "@kanon/core/db";

export function buildManualFacts(
  annuals: readonly {
    fiscalYear: string;
    revenue: number | null;
    grossProfit: number | null;
    freeCashFlow: number | null;
    netIncome: number | null;
  }[],
  reportingCurrency: string,
): SecFinancialFact[] {
  const latest = annuals[annuals.length - 1];
  if (!latest) return [];
  const specs: Array<[number | null, string, string, string]> = [
    [latest.revenue, "Revenue", "年度营业收入", "manual:Revenue"],
    [latest.grossProfit, "GrossProfit", "年度毛利润", "manual:GrossProfit"],
    latest.freeCashFlow !== null
      ? [latest.freeCashFlow, "FreeCashFlow", "年度自由现金流", "manual:FCF"]
      : [latest.netIncome, "NetIncome", "年度净利润", "manual:NetIncome"],
  ];
  return specs
    .filter((s): s is [number, string, string, string] => s[0] !== null)
    .map(([val, metric, label, sourceTag]) => ({
      metric,
      label,
      valueFormatted: formatCompactMoney(val, reportingCurrency),
      period: latest.fiscalYear,
      sourceTag,
    }));
}

export async function saveManualSecOverride(
  tx: KanonDb,
  userId: string,
  upper: string,
  data: ReturnType<typeof UpsertManualSecSnapshotSchema.parse>,
  sortedAnnuals: ReturnType<typeof UpsertManualSecSnapshotSchema.parse>["annuals"],
  manualFacts: SecFinancialFact[],
) {
  const existing = await getSecSnapshot(tx, upper);
  const snapshot = SecSnapshotSchema.parse({
    ticker: upper,
    cik: existing?.cik ?? `MANUAL-${upper}`,
    entityName: data.entityName,
    source: "manual-verified",
    reportingCurrency: data.reportingCurrency,
    fxToUsd: data.fxToUsd,
    adrRatio: data.adrRatio,
    fetchedAt: new Date().toISOString(),
    filings: existing?.filings ?? [],
    facts: manualFacts,
    annuals: sortedAnnuals,
    quarterlies: existing?.quarterlies ?? [],
    insiderSummary: existing?.insiderSummary ?? null,
  });
  return upsertUserSecOverride(tx, userId, snapshot);
}
