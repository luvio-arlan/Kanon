"use client";

import {
  type IndustryPeerRow,
  type MarketBenchmarkResponse,
  MarketBenchmarkResponseSchema,
  type StreetConsensus,
  type ValuationBand,
} from "@kanon/core";
import { Badge, Card } from "@kanon/ui";
import { IconChartBar, IconWorld } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { buildMarketHeaders } from "@/features/ai-settings";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

function ConsensusCard({ c }: { c: StreetConsensus }) {
  const cells = [
    { label: "FY1 营收", val: c.fy1RevenueB ? `$${c.fy1RevenueB}B` : "—", accent: false },
    { label: "FY2 营收", val: c.fy2RevenueB ? `$${c.fy2RevenueB}B` : "—", accent: false },
    { label: "FY1 EPS", val: c.fy1Eps ? `$${c.fy1Eps}` : "—", accent: false },
    { label: "远期 P/E", val: c.impliedForwardPe ? `${c.impliedForwardPe}×` : "—", accent: true },
  ];
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconWorld size={15} stroke={1.5} className="text-ink-muted" />
          <h3 className="text-sm font-semibold text-ink-primary">市场一致预期参照</h3>
        </div>
        <Badge variant="titanium">{c.source === "live-market" ? "实时预期" : "财报推演"}</Badge>
      </div>
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
    </Card>
  );
}

function ValuationBandCard({ b }: { b: ValuationBand }) {
  const posPct = Math.max(4, Math.min(96, b.percentileRank ?? 50));
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconChartBar size={15} stroke={1.5} className="text-ink-muted" />
          <h3 className="text-sm font-semibold text-ink-primary">历史与行业估值分位带</h3>
        </div>
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          当前 {b.current ? `${b.current}×` : "—"} ·{" "}
          {b.percentileRank !== null ? `${b.percentileRank}% 分位` : "待同步"}
        </span>
      </div>
      <div className="space-y-2 border-t border-hairline pt-3">
        <div className="relative h-2 w-full rounded-pill bg-muted">
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface bg-accent-coral"
            style={{ left: `${posPct}%` }}
          />
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

function PeerTableRow({ p }: { p: IndustryPeerRow }) {
  const fmtPct = (v: number | null) => (v !== null ? `${v}%` : "—");
  const fmtMult = (v: number | null) => (v !== null ? `${v}×` : "—");
  return (
    <tr className="hover:bg-canvas/40">
      <td className="px-4 py-3 font-sans">
        <span className="font-mono font-semibold text-ink-primary">{p.ticker}</span>{" "}
        <span className="text-ink-muted">{p.companyName}</span>
      </td>
      <td className="px-3 py-3 text-right text-ink-primary">
        {p.price ? `$${p.price.toFixed(1)}` : "—"}
      </td>
      <td className="px-3 py-3 text-right text-ink-primary">{fmtPct(p.revenueGrowthPct)}</td>
      <td className="px-3 py-3 text-right text-ink-primary">{fmtPct(p.grossMarginPct)}</td>
      <td className="px-3 py-3 text-right text-status-pass">{fmtPct(p.roicPct)}</td>
      <td className="px-3 py-3 text-right text-ink-primary">{fmtMult(p.forwardPe)}</td>
      <td className="px-4 py-3 text-right text-ink-secondary">{fmtMult(p.evFcf)}</td>
    </tr>
  );
}

function PeerBenchmarksTable({
  sectorLabel,
  spyPrice,
  peers,
}: {
  sectorLabel: string;
  spyPrice: number | null;
  peers: readonly IndustryPeerRow[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
        <h3 className="text-sm font-semibold text-ink-primary">真实行业可比矩阵 · {sectorLabel}</h3>
        {spyPrice ? (
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            SPY ${spyPrice.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-hairline bg-canvas/45 text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">同业标的</th>
              <th className="px-3 py-2.5 text-right font-medium">现价</th>
              <th className="px-3 py-2.5 text-right font-medium">营收增速</th>
              <th className="px-3 py-2.5 text-right font-medium">毛利率</th>
              <th className="px-3 py-2.5 text-right font-medium">ROIC</th>
              <th className="px-3 py-2.5 text-right font-medium">Fwd P/E</th>
              <th className="px-4 py-2.5 text-right font-medium">EV/FCF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline font-mono tabular-nums">
            {peers.map((p) => (
              <PeerTableRow key={p.ticker} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function MarketBenchmarksCard({
  ticker,
  currentPrice,
}: {
  ticker: string;
  currentPrice: number;
}) {
  const [data, setData] = useState<MarketBenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void kanonFetch(
      `/api/market/benchmarks?ticker=${encodeURIComponent(ticker)}&price=${currentPrice}`,
      MarketBenchmarkResponseSchema,
      { headers: buildMarketHeaders() },
    ).then((res) => {
      if (!active) return;
      if (res.ok) setData(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ticker, currentPrice]);

  if (loading)
    return <div className="kanon-shimmer h-56 w-full rounded-card border border-hairline" />;
  if (!data) {
    return (
      <Card className="p-6 text-center text-sm text-ink-muted">
        暂无行业可比与一致预期数据，请稍后重试。
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConsensusCard c={data.consensus} />
        <ValuationBandCard b={data.valuationBand} />
      </div>
      <PeerBenchmarksTable
        sectorLabel={data.sectorLabel}
        spyPrice={data.spyPrice}
        peers={data.peers}
      />
    </div>
  );
}
