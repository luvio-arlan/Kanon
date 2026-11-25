"use client";

import type { SensitivityCell, SensitivityMatrix } from "@kanon/core";
import { Card, cn, KANON_LENS_VARIANTS, SegmentedTabs } from "@kanon/ui";
import { motion } from "framer-motion";
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
  if (isCenter) {
    return "bg-accent-coral text-ink-inverse font-semibold shadow-coral-glow ring-1 ring-accent-coral";
  }
  const ring = isCrosshair ? "ring-1 ring-strong" : "border border-hairline";
  if (zone === "margin") return cn("bg-status-pass-soft/75 text-status-pass", ring);
  if (zone === "risk") return cn("bg-status-fail-soft/70 text-status-fail", ring);
  return cn("bg-surface text-ink-primary", ring);
}

function MatrixCellButton(props: {
  cell: SensitivityCell;
  metric: MatrixMetric;
  isCenter: boolean;
  isCrosshair: boolean;
  isFlashing: boolean;
  onEnter: () => void;
  onSelect?: () => void;
}) {
  const { cell, metric, isCenter, isCrosshair, isFlashing, onEnter, onSelect } = props;
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
          "block w-full rounded-control px-2.5 py-3 text-center transition-[background-color,border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral",
          onSelect
            ? "cursor-pointer hover:-translate-y-px hover:shadow-button active:translate-y-0"
            : "cursor-default",
          cellToneClass(cell.zone, isCenter, isCrosshair),
          isFlashing && "kanon-cell-flash",
        )}
      >
        <motion.div key={metric} variants={KANON_LENS_VARIANTS} initial="enter" animate="center">
          <div className="text-base font-medium">
            {metric === "price" ? `$${cell.targetPrice.toFixed(0)}` : `${cell.cagrPct.toFixed(1)}%`}
          </div>
          <div className="mt-0.5 text-xs opacity-80">
            {metric === "price"
              ? `${sign}${cell.returnPct.toFixed(0)}%`
              : `$${cell.targetPrice.toFixed(0)}`}
          </div>
        </motion.div>
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
  flashKey: string | null;
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
      {props.row.map((cell, colIdx) => {
        const cellKey = `${cell.eps}-${cell.pe}`;
        return (
          <MatrixCellButton
            key={cellKey}
            cell={cell}
            metric={props.metric}
            isCenter={props.rowIdx === 2 && colIdx === 2}
            isCrosshair={
              props.hovered !== null &&
              (props.hovered.r === props.rowIdx || props.hovered.c === colIdx)
            }
            isFlashing={props.flashKey === cellKey}
            onEnter={() => props.onHover({ r: props.rowIdx, c: colIdx })}
            onSelect={
              props.onSelectCell ? () => props.onSelectCell?.(cell.eps, cell.pe) : undefined
            }
          />
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

function MatrixHeader({
  caption,
  metric,
  onMetric,
}: {
  caption: string | null;
  metric: MatrixMetric;
  onMetric: (next: MatrixMetric) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
          5×5 估值敏感度矩阵
        </h3>
        {caption ? (
          <span className="font-mono text-xs text-ink-muted tabular-nums">{caption}</span>
        ) : null}
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
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const activeCell = hovered ? matrix.rows[hovered.r]?.[hovered.c] : null;
  const caption = activeCell
    ? `EPS $${activeCell.eps.toFixed(2)} × ${activeCell.pe}x → $${activeCell.targetPrice.toFixed(1)} · CAGR ${activeCell.cagrPct.toFixed(1)}%`
    : null;

  const handleSelect = onSelectBaseCell
    ? (eps: number, pe: number) => {
        setFlashKey(`${eps}-${pe}`);
        onSelectBaseCell(eps, pe);
      }
    : undefined;

  return (
    <Card className="overflow-hidden p-6 sm:p-7" onMouseLeave={() => setHovered(null)}>
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
                flashKey={flashKey}
                onHover={setHovered}
                onSelectCell={handleSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
