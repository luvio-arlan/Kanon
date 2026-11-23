"use client";

import type { SensitivityCell, SensitivityMatrix } from "@kanon/core";
import { Card, cn } from "@kanon/ui";
import { useState } from "react";

interface HoverCoord {
  r: number;
  c: number;
}

function cellToneClass(
  zone: SensitivityCell["zone"],
  isCenter: boolean,
  isCrosshair: boolean,
): string {
  const ring = isCenter
    ? "ring-1 ring-ink-primary font-semibold"
    : isCrosshair
      ? "ring-1 ring-strong"
      : "";
  if (zone === "margin") return cn("bg-status-pass-soft/75 text-status-pass", ring);
  if (zone === "risk") return cn("bg-status-fail-soft/70 text-status-fail", ring);
  return cn("bg-surface text-ink-primary", ring);
}

function MatrixBodyRow({
  epsLabel,
  row,
  rowIdx,
  hovered,
  onHover,
}: {
  epsLabel: number | undefined;
  row: readonly SensitivityCell[];
  rowIdx: number;
  hovered: HoverCoord | null;
  onHover: (coord: HoverCoord | null) => void;
}) {
  const rowLit = hovered?.r === rowIdx;

  return (
    <tr>
      <td
        className={cn(
          "rounded-control px-2 py-2 font-medium transition-colors",
          rowLit ? "bg-muted text-ink-primary" : "text-ink-secondary",
        )}
      >
        ${epsLabel?.toFixed(2)}
      </td>
      {row.map((cell, colIdx) => {
        const isCenter = rowIdx === 2 && colIdx === 2;
        const isCrosshair = hovered !== null && (hovered.r === rowIdx || hovered.c === colIdx);
        const sign = cell.returnPct > 0 ? "+" : "";
        return (
          <td
            key={`${cell.eps}-${cell.pe}`}
            onMouseEnter={() => onHover({ r: rowIdx, c: colIdx })}
            className={cn(
              "cursor-default rounded-control px-2 py-2 text-center transition-all duration-100",
              cellToneClass(cell.zone, isCenter, isCrosshair),
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

function MatrixHeadRow({ peSteps, activeCol }: { peSteps: readonly number[]; activeCol?: number }) {
  return (
    <thead>
      <tr>
        <th className="px-2 py-1.5 text-left font-sans font-medium text-ink-muted">EPS \ PE</th>
        {peSteps.map((pe, colIdx) => (
          <th
            key={pe}
            className={cn(
              "rounded-control px-2 py-1.5 text-center font-medium transition-colors",
              activeCol === colIdx ? "bg-muted text-ink-primary" : "text-ink-secondary",
            )}
          >
            {pe}x
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function SensitivityMatrixCard({ matrix }: { matrix: SensitivityMatrix }) {
  const [hovered, setHovered] = useState<HoverCoord | null>(null);
  const activeCell = hovered ? matrix.rows[hovered.r]?.[hovered.c] : null;

  return (
    <Card className="overflow-hidden p-5" onMouseLeave={() => setHovered(null)}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">5×5 估值敏感度矩阵（EPS × PE）</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            绿区 ≥35% 安全边际 · 红区跌破现价 · 悬停任意格查看十字坐标与年化 CAGR
          </p>
        </div>
        <span className="font-mono text-xs text-ink-secondary tabular-nums">
          {activeCell
            ? `EPS $${activeCell.eps.toFixed(2)} × ${activeCell.pe}x → $${activeCell.targetPrice.toFixed(1)} · CAGR ${activeCell.cagrPct.toFixed(1)}%`
            : "中央高亮为当前中性基准"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1.5 font-mono text-xs tabular-nums">
          <MatrixHeadRow peSteps={matrix.peSteps} activeCol={hovered?.c} />
          <tbody>
            {matrix.rows.map((row, rowIdx) => (
              <MatrixBodyRow
                key={matrix.epsSteps[rowIdx]}
                epsLabel={matrix.epsSteps[rowIdx]}
                row={row}
                rowIdx={rowIdx}
                hovered={hovered}
                onHover={setHovered}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
