"use client";

import {
  type DecisionEpisode,
  type DecisionQuadrant,
  type PortfolioAttributionResponse,
  PortfolioAttributionResponseSchema,
} from "@kanon/core";
import { Badge, Card } from "@kanon/ui";
import { IconLock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

const QUADRANT_META: ReadonlyArray<{ id: Exclude<DecisionQuadrant, "pending">; label: string }> = [
  { id: "skill", label: "判断对 × 盈（实力）" },
  { id: "good_process_bad_luck", label: "判断对 × 亏（好过程坏运气）" },
  { id: "lucky", label: "判断错 × 盈（靠运气）" },
  { id: "mistake", label: "判断错 × 亏（认知错误）" },
];

const QUADRANT_BADGE: Record<
  DecisionQuadrant,
  { label: string; variant: "pass" | "warn" | "fail" | "titanium" }
> = {
  skill: { label: "实力", variant: "pass" },
  good_process_bad_luck: { label: "好过程坏运气", variant: "titanium" },
  lucky: { label: "靠运气", variant: "warn" },
  mistake: { label: "认知错误", variant: "fail" },
  pending: { label: "待验证", variant: "titanium" },
};

function EpisodeRow({ ep }: { ep: DecisionEpisode }) {
  const badge = QUADRANT_BADGE[ep.quadrant];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold text-ink-primary">{ep.ticker}</span>
        <span className="font-mono text-ink-muted">
          {ep.openDate} → {ep.closeDate ?? "持仓中"}
        </span>
        {ep.snapshotHash ? (
          <span
            title={`买入快照锁定：${ep.snapshotHash}`}
            className="inline-flex items-center gap-0.5 font-mono text-ink-muted"
          >
            <IconLock size={12} stroke={1.5} />
            <span>{ep.snapshotHash.slice(0, 6)}</span>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5 font-mono tabular-nums">
        <span className="text-ink-secondary">
          总回报 {ep.totalReturnPct >= 0 ? "+" : ""}
          {ep.totalReturnPct.toFixed(1)}%
        </span>
        {ep.idioReturnPct !== null ? (
          <span className="text-ink-muted">
            超额 {ep.idioReturnPct >= 0 ? "+" : ""}
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
    return (
      <Card className="p-4 text-xs text-ink-muted">
        暂无关联标的的成交回合；在账本登记带档案归属的买入后自动锁定快照并开启「判断 × 盈亏」归因。
      </Card>
    );
  }
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink-muted">判断 × 盈亏 2×2 归因矩阵</h3>
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          实力占比 {data.skillRatePct !== null ? `${data.skillRatePct}%` : "样本不足"} · 待验证{" "}
          {data.counts.pending}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {QUADRANT_META.map((q) => (
          <Card key={q.id} className="p-3.5">
            <div className="text-xs text-ink-muted">{q.label}</div>
            <div className="mt-1 font-mono text-lg font-semibold text-ink-primary tabular-nums">
              {data.counts[q.id]}
            </div>
          </Card>
        ))}
      </div>
      <div className="divide-y divide-hairline rounded-card border border-hairline bg-surface">
        {data.episodes.slice(0, 10).map((ep) => (
          <EpisodeRow key={ep.id} ep={ep} />
        ))}
      </div>
    </section>
  );
}
