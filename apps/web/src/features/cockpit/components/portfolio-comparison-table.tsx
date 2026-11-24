"use client";

import type { ThesisDetail } from "@kanon/core";
import { Button, Card } from "@kanon/ui";
import { IconChevronDown, IconColumns3, IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import {
  COMPARISON_SORT_COLS,
  type ComparisonSortDir,
  type ComparisonSortKey,
  getComparisonSortMetric,
} from "../lib/comparison-sort";
import { PortfolioComparisonRow } from "./portfolio-table-row";

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

function TableHeaderBar({
  selectedCount,
  onOpenCompare,
}: {
  selectedCount: number;
  onOpenCompare: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
      <div className="text-xs font-medium text-ink-secondary">
        全仓横向赔率矩阵 · 勾选 2–3 只标的即可并排对比
      </div>
      <div className="flex items-center gap-2">
        {selectedCount >= 2 ? (
          <Button variant="primary" size="sm" onClick={onOpenCompare}>
            <IconColumns3 size={13} stroke={1.5} />
            <span>{`并排对比 (${selectedCount})`}</span>
          </Button>
        ) : null}
        <a
          href="/api/export/portfolio"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-control border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
        >
          <IconDownload size={13} stroke={1.5} />
          <span>导出 CSV 台账</span>
        </a>
      </div>
    </div>
  );
}

function ComparisonTableHead({
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
        <th className="whitespace-nowrap px-5 py-3.5">标的与仓位</th>
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
  selectedIds,
  onToggleCompare,
  onOpenCompare,
  onQuickInspect,
}: {
  theses: readonly ThesisDetail[];
  selectedIds: readonly string[];
  onToggleCompare: (id: string) => void;
  onOpenCompare: () => void;
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
      <TableHeaderBar selectedCount={selectedIds.length} onOpenCompare={onOpenCompare} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <ComparisonTableHead sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <tbody>
            {sorted.map((thesis) => (
              <PortfolioComparisonRow
                key={thesis.id}
                thesis={thesis}
                checked={selectedIds.includes(thesis.id)}
                disableCheck={selectedIds.length >= 3}
                onToggle={() => onToggleCompare(thesis.id)}
                onQuickInspect={onQuickInspect}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
