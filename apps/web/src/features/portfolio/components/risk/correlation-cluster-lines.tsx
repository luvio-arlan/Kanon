"use client";

import type { CorrelationCluster } from "@kanon/core";
import { Badge } from "@kanon/ui";

export function CorrelationClusterLines({
  clusters,
  capPct,
}: {
  clusters: readonly CorrelationCluster[];
  capPct: number;
}) {
  const multi = clusters.filter((c) => c.tickers.length >= 2);
  if (multi.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-ink-muted">
        相关性共振聚类（阈值 ρ ≥ 0.65，上限 {capPct}%）
      </div>
      <div className="divide-y divide-hairline rounded-card border border-hairline bg-surface px-4">
        {multi.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
          >
            <span className="font-mono font-medium text-ink-primary">{c.tickers.join(" · ")}</span>
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <span className="text-ink-muted">ρ={c.avgIntraCorr.toFixed(2)}</span>
              <span className="text-ink-primary">{c.combinedWeightPct.toFixed(1)}%</span>
              {c.exceedsCap ? <Badge variant="warn">超限</Badge> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
