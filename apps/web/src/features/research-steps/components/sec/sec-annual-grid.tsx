"use client";

import type { SecAnnualFinancial } from "@kanon/core";
import { formatCompact } from "../../lib/forensic-cells";

export interface RestatementMarker {
  concept: string;
  periodEnd: string;
  originalValue: number;
  restatedValue: number;
  restatedAccession: string;
}

function formatSignedEps(value: number | null): string {
  if (value === null) return "—";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
}

function findRestatement(
  restatements: readonly RestatementMarker[],
  periodEnd: string | undefined,
  concept: string,
): RestatementMarker | undefined {
  if (!periodEnd || restatements.length === 0) return undefined;
  return restatements.find((r) => r.periodEnd === periodEnd && r.concept === concept);
}

function restatementAttrs(marker: RestatementMarker | undefined) {
  if (!marker) return { className: "", title: undefined as string | undefined };
  return {
    className: "cursor-help underline decoration-accent-coral underline-offset-4",
    title: `重述记录：${marker.originalValue} → ${marker.restatedValue} · ${marker.restatedAccession}`,
  };
}

function SecAnnualRow({
  row,
  restatements,
}: {
  row: SecAnnualFinancial;
  restatements: readonly RestatementMarker[];
}) {
  const netClass = (row.netIncome ?? 0) < 0 ? "text-status-fail" : "text-ink-secondary";
  const fcfClass = (row.freeCashFlow ?? 0) < 0 ? "text-status-fail" : "text-status-pass";
  const revMark = restatementAttrs(findRestatement(restatements, row.periodEndDate, "revenue"));
  const niMark = restatementAttrs(findRestatement(restatements, row.periodEndDate, "net_income"));
  const epsMark = restatementAttrs(findRestatement(restatements, row.periodEndDate, "diluted_eps"));

  return (
    <tr className="border-t border-hairline">
      <td className="px-5 py-2.5 font-semibold text-ink-primary">{row.fiscalYear}</td>
      <td
        className={`px-3 py-2.5 text-right text-ink-primary ${revMark.className}`}
        title={revMark.title}
      >
        {formatCompact(row.revenue)}
      </td>
      <td className="px-3 py-2.5 text-right text-ink-primary">
        {row.grossMarginPct !== null ? `${row.grossMarginPct.toFixed(1)}%` : "—"}
      </td>
      <td className={`px-3 py-2.5 text-right ${netClass} ${niMark.className}`} title={niMark.title}>
        {formatCompact(row.netIncome)}
      </td>
      <td className={`px-3 py-2.5 text-right ${fcfClass}`}>{formatCompact(row.freeCashFlow)}</td>
      <td
        className={`px-5 py-2.5 text-right font-medium text-ink-primary ${epsMark.className}`}
        title={epsMark.title}
      >
        {formatSignedEps(row.dilutedEps)}
      </td>
    </tr>
  );
}

export function SecTableGrid({
  annuals,
  restatements,
}: {
  annuals: readonly SecAnnualFinancial[];
  restatements: readonly RestatementMarker[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse font-mono text-sm tabular-nums">
        <thead>
          <tr className="bg-muted/45 font-sans text-xs text-ink-muted">
            <th className="px-6 py-3 text-left font-medium">财年</th>
            <th className="px-4 py-3 text-right font-medium">营业收入</th>
            <th className="px-4 py-3 text-right font-medium">毛利率</th>
            <th className="px-4 py-3 text-right font-medium">净利润</th>
            <th className="px-4 py-3 text-right font-medium">自由现金流</th>
            <th className="px-6 py-3 text-right font-medium">稀释 EPS</th>
          </tr>
        </thead>
        <tbody>
          {annuals.map((row) => (
            <SecAnnualRow key={row.fiscalYear} row={row} restatements={restatements} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
