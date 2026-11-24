"use client";

import {
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type ThesisDetail,
} from "@kanon/core";
import { Badge, Button, Sheet } from "@kanon/ui";
import { IconArrowUpRight } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";

export interface CompareThesesSheetProps {
  open: boolean;
  theses: readonly ThesisDetail[];
  onOpenChange: (open: boolean) => void;
  onClearSelection: () => void;
}

interface CompareRowSpec {
  label: string;
  cells: ReadonlyArray<{ id: string; content: ReactNode }>;
}

function CompareRow({ label, cells }: CompareRowSpec) {
  return (
    <tr className="border-t border-hairline align-top">
      <th className="w-28 whitespace-nowrap bg-muted/40 px-3 py-3 text-left text-xs font-medium text-ink-muted">
        {label}
      </th>
      {cells.map((cell) => (
        <td key={cell.id} className="px-3.5 py-3 text-xs leading-relaxed text-ink-primary">
          {cell.content}
        </td>
      ))}
    </tr>
  );
}

function buildPriceAndReturnRows(theses: readonly ThesisDetail[]): CompareRowSpec[] {
  return [
    {
      label: "现价 / 15%买点",
      cells: theses.map((t) => {
        const exp = calculateImpliedExpectations({ summary: t.valuation });
        return {
          id: t.id,
          content: (
            <div className="font-mono tabular-nums">
              <div className="font-semibold">${t.currentPrice.toFixed(2)}</div>
              <div className={exp.isBelowHurdle15 ? "text-status-pass" : "text-ink-muted"}>
                15%买点 ${exp.hurdleEntry15.toFixed(1)}
              </div>
            </div>
          ),
        };
      }),
    },
    {
      label: "中性目标 / CAGR",
      cells: theses.map((t) => ({
        id: t.id,
        content: (
          <div className="font-mono tabular-nums">
            <div className="font-semibold">${t.valuation.base.targetPrice.toFixed(1)}</div>
            <div className="text-ink-secondary">{t.valuation.base.cagrPct.toFixed(1)}% / 年</div>
          </div>
        ),
      })),
    },
  ];
}

function buildNarrativeRows(theses: readonly ThesisDetail[]): CompareRowSpec[] {
  return [
    {
      label: "核心预期差",
      cells: theses.map((t) => ({
        id: t.id,
        content: t.businessFilter.variantPerception || "（待补充）",
      })),
    },
    {
      label: "18M 核心争论",
      cells: theses.map((t) => ({ id: t.id, content: t.businessFilter.keyDebate || "（待补充）" })),
    },
  ];
}

function buildRiskAndReadinessRows(theses: readonly ThesisDetail[]): CompareRowSpec[] {
  return [
    {
      label: "安全边际 / 赔率",
      cells: theses.map((t) => {
        const exp = calculateImpliedExpectations({ summary: t.valuation });
        const ratio =
          t.valuation.riskRewardRatio !== null ? `${t.valuation.riskRewardRatio.toFixed(2)}×` : "∞";
        return {
          id: t.id,
          content: (
            <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
              <span>{exp.marginOfSafetyPct.toFixed(1)}%</span>
              <Badge variant={t.valuation.convictionZone === "attractive" ? "pass" : "titanium"}>
                {ratio}
              </Badge>
            </div>
          ),
        };
      }),
    },
    {
      label: "成熟度 / 仓位",
      cells: theses.map((t) => {
        const r = calculateResearchReadiness(t);
        return {
          id: t.id,
          content: (
            <div className="font-mono tabular-nums">
              <div>
                成熟度 {r.completedCount}/5 ({r.scorePct}%)
              </div>
              <div className="text-ink-secondary">
                权重 {t.currentWeightPct}% / 上限 {t.targetMaxWeightPct}%
              </div>
            </div>
          ),
        };
      }),
    },
  ];
}

function CompareTable({ theses }: { theses: readonly ThesisDetail[] }) {
  const rows = [
    ...buildPriceAndReturnRows(theses),
    ...buildRiskAndReadinessRows(theses),
    ...buildNarrativeRows(theses),
  ];
  return (
    <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted/50 text-left text-xs">
            <th className="w-28 px-3 py-3 font-medium text-ink-muted">对比维度</th>
            {theses.map((t) => (
              <th key={t.id} className="px-3.5 py-3">
                <Link
                  href={`/thesis/${t.id}`}
                  className="inline-flex items-center gap-1 font-semibold text-ink-primary hover:text-accent-coral"
                >
                  <span>{t.companyName}</span>
                  <span className="font-mono text-ink-muted">({t.ticker})</span>
                  <IconArrowUpRight size={13} stroke={1.5} />
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <CompareRow key={row.label} label={row.label} cells={row.cells} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompareThesesSheet(props: CompareThesesSheetProps) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      size="lg"
      title={`标的横向并排对比（${props.theses.length} 只）`}
      subtitle="同屏检视安全边际、赔率比、仓位约束与核心预期差，辅助增量资金配置决策"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={props.onClearSelection}>
            清空已选
          </Button>
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </div>
      }
    >
      <CompareTable theses={props.theses} />
    </Sheet>
  );
}
