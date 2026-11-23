"use client";

import type { SensitivityCell, SensitivityMatrix } from "@kanon/core";
import { Card, cn } from "@kanon/ui";

function cellToneClass(zone: SensitivityCell["zone"], isCenter: boolean): string {
  const ring = isCenter ? "ring-1 ring-ink-primary font-semibold" : "";
  if (zone === "margin") return cn("bg-status-pass-soft/75 text-status-pass", ring);
  if (zone === "risk") return cn("bg-status-fail-soft/70 text-status-fail", ring);
  return cn("bg-surface text-ink-primary", ring);
}

function MatrixBodyRow({
  epsLabel,
  row,
  rowIdx,
}: {
  epsLabel: number | undefined;
  row: readonly SensitivityCell[];
  rowIdx: number;
}) {
  return (
    <tr>
      <td className="px-2 py-2 font-medium text-ink-secondary">${epsLabel?.toFixed(2)}</td>
      {row.map((cell, colIdx) => {
        const isCenter = rowIdx === 2 && colIdx === 2;
        const sign = cell.returnPct > 0 ? "+" : "";
        return (
          <td
            key={`${cell.eps}-${cell.pe}`}
            className={cn(
              "rounded-control px-2 py-2 text-center",
              cellToneClass(cell.zone, isCenter),
            )}
          >
            <div className="text-sm">${cell.targetPrice.toFixed(0)}</div>
            <div className="opacity-80">
              {sign}
              {cell.returnPct.toFixed(0)}%
            </div>
          </td>
        );
      })}
    </tr>
  );
}

export function SensitivityMatrixCard({ matrix }: { matrix: SensitivityMatrix }) {
  return (
    <Card className="overflow-hidden p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">5×5 估值敏感度矩阵（EPS × PE）</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            横向为不同市盈率倍数，纵向为不同远期 EPS；绿色代表 ≥35% 安全边际，红色代表跌破现价
          </p>
        </div>
        <span className="font-mono text-xs text-ink-muted">中央高亮为当前中性基准</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1.5 font-mono text-xs tabular-nums">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left font-sans font-medium text-ink-muted">
                EPS \ PE
              </th>
              {matrix.peSteps.map((pe) => (
                <th key={pe} className="px-2 py-1.5 text-center font-medium text-ink-secondary">
                  {pe}x
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, rowIdx) => (
              <MatrixBodyRow
                key={matrix.epsSteps[rowIdx]}
                epsLabel={matrix.epsSteps[rowIdx]}
                row={row}
                rowIdx={rowIdx}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
