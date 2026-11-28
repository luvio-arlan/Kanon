"use client";

import {
  type DecisionEpisode,
  type DecisionQuadrant,
  type PortfolioAttributionResponse,
  PortfolioAttributionResponseSchema,
} from "@kanon/core";
import { Badge } from "@kanon/ui";
import { IconLock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

const QUADRANT_META: ReadonlyArray<{ id: Exclude<DecisionQuadrant, "pending">; label: string }> = [
  { id: "skill", label: "判断正确 · 盈利" },
  { id: "good_process_bad_luck", label: "判断正确 · 亏损" },
  { id: "lucky", label: "判断失误 · 盈利" },
  { id: "mistake", label: "判断失误 · 亏损" },
];

const QUADRANT_BADGE: Record<
  DecisionQuadrant,
  { label: string; variant: "pass" | "warn" | "fail" | "titanium" }
> = {
  skill: { label: "判断正确 · 盈利", variant: "pass" },
  good_process_bad_luck: { label: "判断正确 · 亏损", variant: "titanium" },
  lucky: { label: "判断失误 · 盈利", variant: "warn" },
  mistake: { label: "判断失误 · 亏损", variant: "fail" },
  pending: { label: "待验证", variant: "titanium" },
};

function EpisodeRow({ ep }: { ep: DecisionEpisode }) {
  const badge = QUADRANT_BADGE[ep.quadrant];
  const excessLabel = ep.outcomeBasis === "idiosyncratic" ? "特质超额" : "相对 SPY";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold text-ink-primary">{ep.ticker}</span>
        <span className="font-mono text-ink-muted">
          {ep.openDate} → {ep.closeDate ?? "持仓中"}
        </span>
        {ep.snapshotHash ? (
          <span
            title={`买入快照锁定：${ep.snapshotHash}`}
            className="inline-flex items-center text-ink-muted"
          >
            <IconLock size={12} stroke={1.5} />
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5 font-mono tabular-nums">
        <span className="text-ink-secondary">
          总回报 {ep.totalReturnPct >= 0 ? "+" : ""}
          {ep.totalReturnPct.toFixed(1)}%
        </span>
        {ep.idioReturnPct !== null && ep.outcomeBasis !== "unavailable" ? (
          <span className="text-ink-muted">
            {excessLabel} {ep.idioReturnPct >= 0 ? "+" : ""}
            {ep.idioReturnPct.toFixed(1)}%
          </span>
        ) : null}
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
    </div>
  );
}

export function DecisionMatrixView() {
  const [data, setData] = useState<PortfolioAttributionResponse | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void kanonFetch("/api/portfolio/attribution", PortfolioAttributionResponseSchema, {
      signal: ctrl.signal,
    }).then((res) => {
      if (!ctrl.signal.aborted && res.ok) setData(res.data);
    });
    return () => ctrl.abort();
  }, []);

  if (!data || data.status === "empty") {
    return <p className="border-y border-hairline py-3 text-xs text-ink-muted">暂无可归因的成交</p>;
  }
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink-muted">判断 × 盈亏归因</h3>
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          胜率 {data.skillRatePct !== null ? `${data.skillRatePct}%` : "样本不足"} · 待验证{" "}
          {data.counts.pending}
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-hairline border-y border-hairline">
        {QUADRANT_META.map((q) => (
          <div key={q.id} className="px-3.5 py-3">
            <div className="text-xs text-ink-muted">{q.label}</div>
            <div className="mt-1 font-mono text-lg font-semibold text-ink-primary tabular-nums">
              {data.counts[q.id]}
            </div>
          </div>
        ))}
      </div>
      <div className="divide-y divide-hairline border-b border-hairline">
        {data.episodes.slice(0, 10).map((ep) => (
          <EpisodeRow key={ep.id} ep={ep} />
        ))}
      </div>
    </section>
  );
}
