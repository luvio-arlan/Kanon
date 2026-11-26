import type { SecAnnualFinancial } from "../../schemas/research";

export interface EffectiveTaxRateInfo {
  rate: number;
  source: "effective" | "statutory-fallback";
  note: string;
}

const STATUTORY_TAX_FALLBACK = 0.21;
const OPERATING_CASH_PCT_OF_REV = 0.02;

export function resolveEffectiveTaxRate(row: SecAnnualFinancial): EffectiveTaxRateInfo {
  if (
    typeof row.pretaxIncome === "number" &&
    row.pretaxIncome > 0 &&
    typeof row.incomeTaxExpense === "number" &&
    Number.isFinite(row.incomeTaxExpense)
  ) {
    const clamped = Math.max(0, Math.min(0.4, row.incomeTaxExpense / row.pretaxIncome));
    return { rate: clamped, source: "effective", note: "实际有效税率" };
  }
  return {
    rate: STATUTORY_TAX_FALLBACK,
    source: "statutory-fallback",
    note: "法定税率回退 (21%)",
  };
}

export function computeInvestedCapital(
  row: SecAnnualFinancial,
  options?: { excludeGoodwill?: boolean },
): number | null {
  if (typeof row.stockholdersEquity !== "number") return null;
  const debt = row.totalDebt ?? 0;
  const leases = Math.max(0, row.operatingLeaseLiability ?? 0);
  const cash = Math.max(0, row.cashAndEquiv ?? 0);
  const operatingCash =
    typeof row.revenue === "number" && row.revenue > 0
      ? row.revenue * OPERATING_CASH_PCT_OF_REV
      : 0;
  const excessCash = Math.max(0, cash - operatingCash);
  const baseIc = row.stockholdersEquity + debt + leases - excessCash;
  if (!options?.excludeGoodwill) return baseIc;
  const goodwill = Math.max(0, row.goodwill ?? 0);
  return baseIc - goodwill;
}
