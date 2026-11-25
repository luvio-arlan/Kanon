import { type ReportingCurrency, roundTo, type SecAnnualFinancial } from "@kanon/core";

export const CURRENCY_FX: Record<ReportingCurrency, number> = {
  USD: 1,
  HKD: 0.128,
  CNY: 0.138,
  EUR: 1.08,
  TWD: 0.031,
  JPY: 0.0066,
  GBP: 1.27,
  CHF: 1.13,
  CAD: 0.72,
  DKK: 0.145,
  KRW: 0.00072,
};

export const CURRENCIES = Object.keys(CURRENCY_FX) as ReportingCurrency[];

export interface ManualRowDraft {
  id: string;
  fiscalYear: string;
  revenueB: string;
  grossMarginPct: string;
  netIncomeB: string;
  fcfB: string;
  eps: string;
}

export function toManualRowDraft(row: SecAnnualFinancial, idx: number): ManualRowDraft {
  return {
    id: `row-${row.fiscalYear}-${idx}`,
    fiscalYear: row.fiscalYear,
    revenueB: row.revenue ? String(roundTo(row.revenue / 1e9, 2)) : "",
    grossMarginPct: row.grossMarginPct !== null ? String(row.grossMarginPct) : "",
    netIncomeB: row.netIncome ? String(roundTo(row.netIncome / 1e9, 2)) : "",
    fcfB: row.freeCashFlow ? String(roundTo(row.freeCashFlow / 1e9, 2)) : "",
    eps: row.dilutedEps !== null ? String(roundTo(row.dilutedEps, 2)) : "",
  };
}

export function createEmptyManualRow(): ManualRowDraft {
  return {
    id: `new-${Date.now()}`,
    fiscalYear: `FY${new Date().getFullYear()}`,
    revenueB: "",
    grossMarginPct: "",
    netIncomeB: "",
    fcfB: "",
    eps: "",
  };
}

export function createDefaultManualRows(): ManualRowDraft[] {
  const yr = new Date().getFullYear() - 1;
  return [yr - 2, yr - 1, yr].map((y) => ({
    id: `def-${y}`,
    fiscalYear: `FY${y}`,
    revenueB: "",
    grossMarginPct: "",
    netIncomeB: "",
    fcfB: "",
    eps: "",
  }));
}

export function parseManualRowToAnnual(
  row: ManualRowDraft,
  fx: number,
  adrRatio: number,
): SecAnnualFinancial | null {
  const revB = Number(row.revenueB);
  if (!row.fiscalYear.trim() || !Number.isFinite(revB) || revB <= 0) return null;
  const rev = revB * 1e9 * fx;
  const gm = Number(row.grossMarginPct);
  const gmValid = Number.isFinite(gm) && gm >= 0 && gm <= 100 ? gm : null;
  const niB = Number(row.netIncomeB);
  const fcfB = Number(row.fcfB);
  const epsRaw = Number(row.eps);
  const fcf = Number.isFinite(fcfB) ? fcfB * 1e9 * fx : null;
  return {
    fiscalYear: row.fiscalYear.trim(),
    revenue: rev,
    grossProfit: gmValid !== null ? rev * (gmValid / 100) : null,
    grossMarginPct: gmValid,
    netIncome: Number.isFinite(niB) ? niB * 1e9 * fx : null,
    operatingCashFlow: fcf,
    capex: fcf !== null ? 0 : null,
    freeCashFlow: fcf,
    dilutedEps: Number.isFinite(epsRaw) && epsRaw > 0 ? roundTo(epsRaw * fx * adrRatio, 2) : null,
  };
}
