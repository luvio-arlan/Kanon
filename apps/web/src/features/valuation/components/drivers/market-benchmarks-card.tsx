"use client";

import {
  type IndustryPeerRow,
  type MarketBenchmarkResponse,
  MarketBenchmarkResponseSchema,
} from "@kanon/core";
import { Button, Card } from "@kanon/ui";
import { IconRefresh } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { buildMarketHeaders } from "@/shared/lib/client-provider-storage";
import { kanonFetch } from "@/shared/lib/kanon-fetch";
import { ConsensusCard, ValuationBandCard } from "./benchmark-summary-cards";

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
  ticker,
  sectorLabel,
  spyPrice,
  peers,
}: {
  ticker: string;
  sectorLabel: string;
  spyPrice: number | null;
  peers: readonly IndustryPeerRow[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
        <h3 className="text-sm font-semibold text-ink-primary">行业可比矩阵 · {sectorLabel}</h3>
        {spyPrice ? (
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            SPY ${spyPrice.toFixed(1)}
          </span>
        ) : null}
      </div>
      {peers.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-ink-muted">
          暂未收录 {ticker} 的行业可比图谱，不以默认大盘科技股代替同业对照。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-hairline bg-canvas/45 text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">同业标的</th>
                <th className="px-3 py-2.5 text-right font-medium">现价</th>
                <th className="px-3 py-2.5 text-right font-medium">营收增速</th>
                <th className="px-3 py-2.5 text-right font-medium">毛利率</th>
                <th className="px-3 py-2.5 text-right font-medium">ROIC</th>
                <th className="px-3 py-2.5 text-right font-medium">P/E</th>
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
      )}
    </Card>
  );
}

function useMarketBenchmarks(ticker: string, currentPrice: number) {
  const [data, setData] = useState<MarketBenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const prevTickerRef = useRef(ticker);

  useEffect(() => {
    const tickerChanged = prevTickerRef.current !== ticker;
    prevTickerRef.current = ticker;
    const delayMs = tickerChanged || reloadNonce > 0 ? 0 : 450;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void kanonFetch(
        `/api/market/benchmarks?ticker=${encodeURIComponent(ticker)}&price=${currentPrice}`,
        MarketBenchmarkResponseSchema,
        { headers: buildMarketHeaders(), signal: ctrl.signal },
      ).then((res) => {
        if (ctrl.signal.aborted) return;
        if (res.ok) setData(res.data);
        setLoading(false);
      });
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [ticker, currentPrice, reloadNonce]);

  return { data, loading, retry: () => setReloadNonce((n) => n + 1) };
}

export function MarketBenchmarksCard({
  ticker,
  currentPrice,
}: {
  ticker: string;
  currentPrice: number;
}) {
  const { data, loading, retry } = useMarketBenchmarks(ticker, currentPrice);
  if (loading && !data) {
    return <div className="kanon-shimmer h-56 w-full rounded-card border border-hairline" />;
  }
  if (!data) {
    return (
      <Card className="flex flex-col items-center gap-3 p-6 text-center text-sm text-ink-muted">
        <span>暂无行业可比与外部预期数据，请稍后重试。</span>
        <Button variant="outline" size="xs" onClick={retry}>
          <IconRefresh size={13} stroke={1.5} />
          <span>重新加载</span>
        </Button>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConsensusCard c={data.consensus} extrapolation={data.historicalExtrapolation} />
        <ValuationBandCard b={data.valuationBand} peerRange={data.peerMultipleRange} />
      </div>
      <PeerBenchmarksTable
        ticker={data.ticker}
        sectorLabel={data.sectorLabel}
        spyPrice={data.spyPrice}
        peers={data.peers}
      />
    </div>
  );
}
