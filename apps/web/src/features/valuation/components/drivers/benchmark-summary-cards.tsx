"use client";

import type {
  HistoricalExtrapolation,
  PeerMultipleRange,
  StreetConsensus,
  ValuationBand,
} from "@kanon/core";
import { Badge, Card } from "@kanon/ui";
import { IconChartBar, IconWorld } from "@tabler/icons-react";
import { AlertBellToggle } from "@/shared/components/alert-bell-toggle";

function LiveConsensusGrid({ c }: { c: StreetConsensus }) {
  const cells = [
    { label: "FY1 营收", val: c.fy1RevenueB ? `$${c.fy1RevenueB}B` : "—", accent: false },
    { label: "FY2 营收", val: c.fy2RevenueB ? `$${c.fy2RevenueB}B` : "—", accent: false },
    { label: "FY1 EPS", val: c.fy1Eps ? `$${c.fy1Eps}` : "—", accent: false },
    { label: "远期 P/E", val: c.impliedForwardPe ? `${c.impliedForwardPe}×` : "—", accent: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-3 font-mono text-xs tabular-nums sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label}>
          <div className="font-sans text-ink-muted">{cell.label}</div>
          <div
            className={`mt-1 text-sm font-semibold ${cell.accent ? "text-accent-coral" : "text-ink-primary"}`}
          >
            {cell.val}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoricalExtrapolationGrid({ ext }: { ext: HistoricalExtrapolation }) {
  const cells = [
    { label: "历史 CAGR", val: ext.revenueCagrPct !== null ? `${ext.revenueCagrPct}%` : "—" },
    {
      label: "外推 FY1 营收",
      val: ext.extrapolatedFy1RevenueB !== null ? `$${ext.extrapolatedFy1RevenueB}B` : "—",
    },
    {
      label: "外推 FY1 EPS",
      val: ext.extrapolatedFy1Eps !== null ? `$${ext.extrapolatedFy1Eps}` : "—",
    },
    {
      label: "外推倍数",
      val:
        ext.impliedMultipleOnExtrapolatedEps !== null
          ? `${ext.impliedMultipleOnExtrapolatedEps}×`
          : "—",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-3 font-mono text-xs tabular-nums sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label}>
          <div className="font-sans text-ink-muted">{cell.label}</div>
          <div className="mt-1 text-sm font-semibold text-ink-primary">{cell.val}</div>
        </div>
      ))}
    </div>
  );
}

export function ConsensusCard({
  c,
  extrapolation,
}: {
  c: StreetConsensus;
  extrapolation?: HistoricalExtrapolation | null;
}) {
  if (c.source === "live-market") {
    return (
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconWorld size={15} stroke={1.5} className="text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink-primary">市场一致预期参照</h3>
          </div>
          <Badge variant="titanium">实时预期</Badge>
        </div>
        <LiveConsensusGrid c={c} />
      </Card>
    );
  }
  if (!extrapolation) {
    return (
      <div className="rounded-control border border-hairline bg-canvas/35 px-4 py-2.5 text-xs text-ink-muted">
        外部市场预测未接入
      </div>
    );
  }
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconWorld size={15} stroke={1.5} className="text-ink-muted" />
          <h3 className="text-sm font-semibold text-ink-primary">历史财报外推参照</h3>
        </div>
      </div>
      <HistoricalExtrapolationGrid ext={extrapolation} />
    </Card>
  );
}

function HistoricalBandCard({ b, thesisId }: { b: ValuationBand; thesisId?: string }) {
  const posPct = b.percentileRank !== null ? Math.max(4, Math.min(96, b.percentileRank)) : null;
  const rankLabel = b.percentileRank !== null ? `${b.percentileRank}% 分位` : "待同步";
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconChartBar size={15} stroke={1.5} className="text-ink-muted" />
          <h3 className="text-sm font-semibold text-ink-primary">历史估值分位带</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            当前 {b.current ? `${b.current}×` : "—"} · {rankLabel}
          </span>
          {thesisId ? (
            <AlertBellToggle
              rule={{ kind: "pe_band_breach", thesisId }}
              title="P10 / P90 分位越界提醒"
            />
          ) : null}
        </div>
      </div>
      <div className="space-y-2 border-t border-hairline pt-3">
        <div className="relative h-2 w-full rounded-pill bg-muted">
          {posPct !== null ? (
            <div
              data-band-marker="true"
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface bg-accent-coral"
              style={{ left: `${posPct}%` }}
            />
          ) : null}
        </div>
        <div className="flex justify-between font-mono text-xs text-ink-muted tabular-nums">
          <span>P10 · {b.p10 ?? "—"}×</span>
          <span>P50 · {b.p50 ?? "—"}×</span>
          <span>P90 · {b.p90 ?? "—"}×</span>
        </div>
      </div>
    </Card>
  );
}

function PeerMultipleRangeBody({ peerRange }: { peerRange: PeerMultipleRange }) {
  return (
    <div className="space-y-2 border-t border-hairline pt-3 font-mono text-xs text-ink-muted tabular-nums">
      <div className="flex justify-between">
        <span>最低 · {peerRange.min ?? "—"}×</span>
        <span className="font-semibold text-ink-primary">中位 · {peerRange.median ?? "—"}×</span>
        <span>最高 · {peerRange.max ?? "—"}×</span>
      </div>
      <div className="flex justify-between font-sans text-xs text-ink-muted">
        <span>当前静态 P/E：{peerRange.current ? `${peerRange.current}×` : "暂无"}</span>
        <span>样本：{peerRange.sampleSize} 家同业</span>
      </div>
    </div>
  );
}

export function ValuationBandCard({
  thesisId,
  b,
  peerRange,
}: {
  thesisId?: string;
  b: ValuationBand | null;
  peerRange?: PeerMultipleRange | null;
}) {
  if (b) return <HistoricalBandCard b={b} thesisId={thesisId} />;
  if (!peerRange) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-control border border-hairline bg-canvas/35 px-4 py-2.5 text-xs text-ink-muted">
        <span>拆股或日频行情未就绪，分位带暂不可用</span>
        {thesisId ? <AlertBellToggle rule={{ kind: "pe_band_breach", thesisId }} disabled /> : null}
      </div>
    );
  }
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconChartBar size={15} stroke={1.5} className="text-ink-muted" />
          <h3 className="text-sm font-semibold text-ink-primary">同业当前倍数区间</h3>
        </div>
        {thesisId ? <AlertBellToggle rule={{ kind: "pe_band_breach", thesisId }} disabled /> : null}
      </div>
      <PeerMultipleRangeBody peerRange={peerRange} />
    </Card>
  );
}
