"use client";

import {
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type ThesisDetail,
} from "@kanon/core";
import { Badge, Card, ReadinessRing } from "@kanon/ui";
import { IconArrowUpRight, IconChevronDown, IconDownload } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import {
  COMPARISON_SORT_COLS,
  type ComparisonSortDir,
  type ComparisonSortKey,
  getComparisonSortMetric,
} from "../lib/comparison-sort";

function zoneBadgeVariant(zone: ThesisDetail["valuation"]["convictionZone"]) {
  if (zone === "attractive") return "pass" as const;
  if (zone === "balanced") return "titanium" as const;
  return "warn" as const;
}

function SortableTh(props: {
  label: string;
  active: boolean;
  dir: ComparisonSortDir;
  onClick: () => void;
}) {
  const iconCls = `transition-transform duration-150 ${props.active ? "text-accent-coral" : "opacity-45"} ${props.active && props.dir === "asc" ? "rotate-180" : ""}`;
  return (
    <th className="whitespace-nowrap px-4 py-3.5 text-right">
      <button
        type="button"
        onClick={props.onClick}
        className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap font-medium text-ink-muted transition-colors hover:text-ink-primary"
      >
        <span className={props.active ? "text-ink-primary" : ""}>{props.label}</span>
        <IconChevronDown size={12} stroke={1.5} className={iconCls} />
      </button>
    </th>
  );
}

function IdentityCell({ thesis }: { thesis: ThesisDetail }) {
  return (
    <td className="px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-ink-muted tabular-nums">{thesis.indexLabel}</span>
        <div>
          <Link
            href={`/thesis/${thesis.id}`}
            className="text-sm font-semibold text-ink-primary hover:text-accent-coral"
          >
            {thesis.companyName}
          </Link>
          <div className="mt-0.5 font-mono text-xs text-ink-muted">
            {thesis.ticker} · {thesis.sectorTag}
          </div>
        </div>
      </div>
    </td>
  );
}

function ValuationMetricCells({ thesis }: { thesis: ThesisDetail }) {
  const { valuation } = thesis;
  const exp = calculateImpliedExpectations({ summary: valuation });
  return (
    <>
      <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-sm text-ink-primary tabular-nums">
        <div>${thesis.currentPrice.toFixed(2)}</div>
        <div className="text-xs text-ink-muted">15%买点 ${exp.hurdleEntry15.toFixed(1)}</div>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-sm tabular-nums">
        <div className="font-semibold text-ink-primary">
          ${valuation.base.targetPrice.toFixed(1)}
        </div>
        <div className="text-xs text-status-pass">
          {valuation.upsidePct > 0 ? "+" : ""}
          {valuation.upsidePct.toFixed(1)}%
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-sm text-ink-primary tabular-nums">
        {valuation.base.cagrPct.toFixed(1)}%
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-sm tabular-nums">
        <span className={exp.marginOfSafetyPct >= 25 ? "text-status-pass" : "text-ink-primary"}>
          {exp.marginOfSafetyPct.toFixed(1)}%
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-sm text-ink-secondary tabular-nums">
        -{Math.max(0, valuation.downsidePct).toFixed(1)}%
      </td>
    </>
  );
}

function ActionCells({
  thesis,
  onQuickInspect,
}: {
  thesis: ThesisDetail;
  onQuickInspect: (t: ThesisDetail) => void;
}) {
  return (
    <td className="whitespace-nowrap px-5 py-4 text-right">
      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <button
          type="button"
          onClick={() => onQuickInspect(thesis)}
          className="cursor-pointer whitespace-nowrap rounded-control px-2 py-1 text-xs text-ink-secondary hover:bg-muted hover:text-ink-primary"
        >
          校准
        </button>
        <Link
          href={`/thesis/${thesis.id}`}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-control px-2.5 py-1 text-xs font-medium text-ink-primary hover:bg-titanium-subtle"
        >
          <span>画布</span>
          <IconArrowUpRight size={14} stroke={1.5} />
        </Link>
      </div>
    </td>
  );
}

function ComparisonRow({
  thesis,
  onQuickInspect,
}: {
  thesis: ThesisDetail;
  onQuickInspect: (t: ThesisDetail) => void;
}) {
  const { valuation } = thesis;
  const readiness = calculateResearchReadiness(thesis);
  const ratioText =
    valuation.riskRewardRatio !== null ? `${valuation.riskRewardRatio.toFixed(2)}×` : "∞";

  return (
    <tr className="border-t border-hairline transition-colors hover:bg-muted/45">
      <IdentityCell thesis={thesis} />
      <ValuationMetricCells thesis={thesis} />
      <td className="whitespace-nowrap px-4 py-4 text-right">
        <Badge
          variant={zoneBadgeVariant(valuation.convictionZone)}
          className="font-mono tabular-nums"
        >
          {ratioText}
        </Badge>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right">
        <div className="flex justify-end">
          <ReadinessRing
            scorePct={readiness.scorePct}
            size={20}
            label={`${readiness.completedCount}/5`}
          />
        </div>
      </td>
      <ActionCells thesis={thesis} onQuickInspect={onQuickInspect} />
    </tr>
  );
}

function TableHead({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: ComparisonSortKey;
  sortDir: ComparisonSortDir;
  onSort: (k: ComparisonSortKey) => void;
}) {
  return (
    <thead>
      <tr className="bg-muted/50 text-xs font-medium text-ink-muted">
        <th className="whitespace-nowrap px-5 py-3.5">标的与赛道</th>
        <th className="whitespace-nowrap px-4 py-3.5 text-right">现价 / 15%买点</th>
        <th className="whitespace-nowrap px-4 py-3.5 text-right">中性目标 / 空间</th>
        {COMPARISON_SORT_COLS.map((c) => (
          <SortableTh
            key={c.key}
            label={c.label}
            active={sortKey === c.key}
            dir={sortDir}
            onClick={() => onSort(c.key)}
          />
        ))}
        <th className="whitespace-nowrap px-5 py-3.5 text-right">操作</th>
      </tr>
    </thead>
  );
}

export function PortfolioComparisonTable({
  theses,
  onQuickInspect,
}: {
  theses: readonly ThesisDetail[];
  onQuickInspect: (thesis: ThesisDetail) => void;
}) {
  const [sortKey, setSortKey] = useState<ComparisonSortKey>("odds");
  const [sortDir, setSortDir] = useState<ComparisonSortDir>("desc");
  const handleSort = (nextKey: ComparisonSortKey) => {
    if (nextKey === sortKey) return setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    setSortKey(nextKey);
    setSortDir("desc");
  };
  const factor = sortDir === "desc" ? 1 : -1;
  const sorted = [...theses].sort(
    (a, b) => factor * (getComparisonSortMetric(b, sortKey) - getComparisonSortMetric(a, sortKey)),
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
        <div className="text-xs font-medium text-ink-secondary">
          全仓横向赔率矩阵 · 点击列头升/降序排列
        </div>
        <a
          href="/api/export/portfolio"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-control border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
        >
          <IconDownload size={13} stroke={1.5} />
          <span>导出 CSV 台账</span>
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <TableHead sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <tbody>
            {sorted.map((thesis) => (
              <ComparisonRow key={thesis.id} thesis={thesis} onQuickInspect={onQuickInspect} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
