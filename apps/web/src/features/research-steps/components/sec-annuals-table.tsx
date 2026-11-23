"use client";

import type { SecAnnualFinancial } from "@kanon/core";
import { Card } from "@kanon/ui";

function formatCompactMoney(value: number | null): string {
  if (value === null) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatSignedEps(value: number | null): string {
  if (value === null) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function SecAnnualRow({ row }: { row: SecAnnualFinancial }) {
  const netClass = (row.netIncome ?? 0) < 0 ? "text-status-fail" : "text-ink-secondary";
  const fcfClass = (row.freeCashFlow ?? 0) < 0 ? "text-status-fail" : "text-status-pass";

  return (
    <tr className="border-t border-hairline">
      <td className="px-5 py-2.5 font-semibold text-ink-primary">{row.fiscalYear}</td>
      <td className="px-3 py-2.5 text-right text-ink-primary">{formatCompactMoney(row.revenue)}</td>
      <td className="px-3 py-2.5 text-right text-ink-primary">
        {row.grossMarginPct !== null ? `${row.grossMarginPct.toFixed(1)}%` : "—"}
      </td>
      <td className={`px-3 py-2.5 text-right ${netClass}`}>{formatCompactMoney(row.netIncome)}</td>
      <td className={`px-3 py-2.5 text-right ${fcfClass}`}>
        {formatCompactMoney(row.freeCashFlow)}
      </td>
      <td className="px-5 py-2.5 text-right font-medium text-ink-primary">
        {formatSignedEps(row.dilutedEps)}
      </td>
    </tr>
  );
}

export function SecAnnualsTable({
  annuals,
  title = "SEC 多年度基本面质量轨迹",
}: {
  annuals: readonly SecAnnualFinancial[];
  title?: string;
}) {
  if (annuals.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
        <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
        <span className="font-mono text-xs text-ink-muted">SEC 10-K / XBRL 事实</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse font-mono text-xs tabular-nums">
          <thead>
            <tr className="bg-muted/45 font-sans text-ink-muted">
              <th className="px-5 py-2.5 text-left font-medium">财年</th>
              <th className="px-3 py-2.5 text-right font-medium">营业收入</th>
              <th className="px-3 py-2.5 text-right font-medium">毛利率</th>
              <th className="px-3 py-2.5 text-right font-medium">净利润</th>
              <th className="px-3 py-2.5 text-right font-medium">自由现金流</th>
              <th className="px-5 py-2.5 text-right font-medium">稀释 EPS</th>
            </tr>
          </thead>
          <tbody>
            {annuals.map((row) => (
              <SecAnnualRow key={row.fiscalYear} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
