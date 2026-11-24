"use client";

import type { SensitivityCell, SensitivityMatrix } from "@kanon/core";
import { Card, cn, SegmentedTabs } from "@kanon/ui";
import { useState } from "react";

type MatrixMetric = "price" | "cagr";
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

function MatrixCellButton(props: {
  cell: SensitivityCell;
  metric: MatrixMetric;
  isCenter: boolean;
  isCrosshair: boolean;
  onEnter: () => void;
  onSelect?: () => void;
}) {
  const { cell, metric, isCenter, isCrosshair, onEnter, onSelect } = props;
  const sign = cell.returnPct > 0 ? "+" : "";
  return (
    <td className="p-0">
      <button
        type="button"
        onMouseEnter={onEnter}
        onFocus={onEnter}
        onClick={onSelect}
        title="点击将该 (EPS, PE) 组合设为中性基准"
        className={cn(
          "block w-full rounded-control px-2 py-2 text-center transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral",
          onSelect ? "cursor-pointer hover:scale-[1.02]" : "cursor-default",
          cellToneClass(cell.zone, isCenter, isCrosshair),
        )}
      >
        <div className="text-sm">
          {metric === "price" ? `$${cell.targetPrice.toFixed(0)}` : `${cell.cagrPct.toFixed(1)}%`}
        </div>
        <div className="opacity-80">
          {metric === "price"
            ? `${sign}${cell.returnPct.toFixed(0)}%`
            : `$${cell.targetPrice.toFixed(0)}`}
        </div>
      </button>
    </td>
  );
}

function MatrixBodyRow(props: {
  epsLabel: number | undefined;
  row: readonly SensitivityCell[];
  rowIdx: number;
  metric: MatrixMetric;
  hovered: HoverCoord | null;
  onHover: (coord: HoverCoord | null) => void;
  onSelectCell?: (eps: number, pe: number) => void;
}) {
  const rowLit = props.hovered?.r === props.rowIdx;
  return (
    <tr>
      <td
        className={cn(
          "rounded-control px-2 py-2 font-medium transition-colors",
          rowLit ? "bg-muted text-ink-primary" : "text-ink-secondary",
        )}
      >
        ${props.epsLabel?.toFixed(2)}
      </td>
      {props.row.map((cell, colIdx) => (
        <MatrixCellButton
          key={`${cell.eps}-${cell.pe}`}
          cell={cell}
          metric={props.metric}
          isCenter={props.rowIdx === 2 && colIdx === 2}
          isCrosshair={
            props.hovered !== null &&
            (props.hovered.r === props.rowIdx || props.hovered.c === colIdx)
          }
          onEnter={() => props.onHover({ r: props.rowIdx, c: colIdx })}
          onSelect={props.onSelectCell ? () => props.onSelectCell?.(cell.eps, cell.pe) : undefined}
        />
      ))}
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

function MatrixHeader({
  caption,
  metric,
  onMetric,
}: {
  caption: string;
  metric: MatrixMetric;
  onMetric: (next: MatrixMetric) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-primary">5×5 估值敏感度矩阵（EPS × PE）</h3>
        <p className="mt-0.5 text-xs text-ink-muted">{caption}</p>
      </div>
      <SegmentedTabs
        layoutId="sensitivity-metric-mode"
        value={metric}
        onChange={onMetric}
        items={[
          { id: "price", label: "目标价" },
          { id: "cagr", label: "年化 CAGR" },
        ]}
      />
    </div>
  );
}

export function SensitivityMatrixCard({
  matrix,
  onSelectBaseCell,
}: {
  matrix: SensitivityMatrix;
  onSelectBaseCell?: (eps: number, pe: number) => void;
}) {
  const [hovered, setHovered] = useState<HoverCoord | null>(null);
  const [metric, setMetric] = useState<MatrixMetric>("price");
  const activeCell = hovered ? matrix.rows[hovered.r]?.[hovered.c] : null;
  const caption = activeCell
    ? `EPS $${activeCell.eps.toFixed(2)} × ${activeCell.pe}x → $${activeCell.targetPrice.toFixed(1)} · CAGR ${activeCell.cagrPct.toFixed(1)}%`
    : "绿区 ≥35% 安全边际 · 点击任意格一键回填中性基准";

  return (
    <Card className="overflow-hidden p-5" onMouseLeave={() => setHovered(null)}>
      <MatrixHeader caption={caption} metric={metric} onMetric={setMetric} />
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
                metric={metric}
                hovered={hovered}
                onHover={setHovered}
                onSelectCell={onSelectBaseCell}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
