import type { SecForensicReport } from "@kanon/core";

export type ForensicCellTone = "primary" | "pass" | "warn" | "muted";

export interface ForensicCellSpec {
  label: string;
  value: string;
  tone: ForensicCellTone;
}

export function formatCompact(value: number | null): string {
  if (value === null) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatPct(value: number | null, signed = false, suffix = "%"): string {
  if (value === null) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function pickTone(
  val: number | null,
  cond: (n: number) => boolean,
  hit: "pass" | "warn",
  miss: ForensicCellTone,
): ForensicCellTone {
  return cond(val ?? 0) ? hit : miss;
}

function buildProfitabilityCells(report: SecForensicReport): ForensicCellSpec[] {
  return [
    {
      label: `投入资本回报率 (ROIC · ${report.latestFiscalYear})`,
      value: formatPct(report.roicPct),
      tone: pickTone(report.roicPct, (n) => n >= 18, "pass", "primary"),
    },
    {
      label: "增量资本回报率 (ROIIC)",
      value: formatPct(report.roiicPct),
      tone: pickTone(report.roiicPct, (n) => n >= 20, "pass", "primary"),
    },
    {
      label: "Rule of 40（增速 + FCF 率）",
      value: report.ruleOf40Score !== null ? report.ruleOf40Score.toFixed(1) : "—",
      tone: pickTone(report.ruleOf40Score, (n) => n >= 40, "pass", "muted"),
    },
    {
      label: "扣除 SBC 真实 FCF 转化率",
      value: formatPct(report.ownerFcfConversionPct),
      tone: pickTone(report.ownerFcfConversionPct, (n) => n >= 70, "pass", "warn"),
    },
    {
      label: "Sloan 应计项占比（越低越实）",
      value: formatPct(report.sloanAccrualPct, true),
      tone: pickTone(report.sloanAccrualPct, (n) => n >= 10, "warn", "pass"),
    },
  ];
}

export function buildForensicCells(report: SecForensicReport): ForensicCellSpec[] {
  const shareVal =
    report.shareChangeCagrPct !== null
      ? `${report.shareChangeCagrPct > 0 ? "+" : ""}${report.shareChangeCagrPct.toFixed(2)}%/yr`
      : "—";
  return [
    ...buildProfitabilityCells(report),
    {
      label: "OCF / 净利润现金转化率",
      value: formatPct(report.ocfToNetIncomePct),
      tone: pickTone(report.ocfToNetIncomePct, (n) => n >= 100, "pass", "primary"),
    },
    {
      label: "SBC 占经营现金流比",
      value: formatPct(report.sbcPctOfOcf),
      tone: pickTone(report.sbcPctOfOcf, (n) => n >= 25, "warn", "primary"),
    },
    {
      label: "股本年化净变动（负为净回购）",
      value: shareVal,
      tone: pickTone(report.shareChangeCagrPct, (n) => n <= 0, "pass", "warn"),
    },
    {
      label: "净现金 / 净负债（Cash - Debt）",
      value: formatCompact(report.netCash),
      tone: pickTone(report.netCash, (n) => n >= 0, "pass", "muted"),
    },
  ];
}
