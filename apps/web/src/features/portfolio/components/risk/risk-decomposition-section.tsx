"use client";

import { type PortfolioRiskResponse, PortfolioRiskResponseSchema } from "@kanon/core";
import { Card } from "@kanon/ui";
import { useEffect, useState } from "react";
import { kanonFetch } from "@/shared/lib/kanon-fetch";
import { CorrelationClusterLines } from "./correlation-cluster-lines";

function RiskMetricMiniCard(p: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-ink-muted">{p.label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-ink-primary tabular-nums">
        {p.value}
      </div>
    </Card>
  );
}

function RiskContribTable({ rows }: { rows: PortfolioRiskResponse["contributions"] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
      <table className="w-full min-w-[440px] text-left text-xs">
        <thead className="border-b border-hairline bg-canvas/50 text-ink-muted">
          <tr>
            <th className="px-3.5 py-2 font-medium">标的</th>
            <th className="px-3.5 py-2 text-right font-medium">权重</th>
            <th className="px-3.5 py-2 text-right font-medium">独立波动</th>
            <th className="px-3.5 py-2 text-right font-medium">边际 MCR</th>
            <th className="px-3.5 py-2 text-right font-medium">风险占比 PCR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.ticker}>
              <td className="px-3.5 py-2 font-medium text-ink-primary">{r.ticker}</td>
              <td className="px-3.5 py-2 text-right text-ink-secondary">
                {r.weightPct.toFixed(1)}%
              </td>
              <td className="px-3.5 py-2 text-right text-ink-secondary">
                {r.standaloneVolPct !== null ? `${r.standaloneVolPct.toFixed(1)}%` : "—"}
              </td>
              <td className="px-3.5 py-2 text-right text-ink-secondary">
                {r.mcrPct !== null ? `${r.mcrPct.toFixed(1)}%` : "—"}
              </td>
              <td className="px-3.5 py-2 text-right font-medium text-ink-primary">
                {r.pcrPct !== null ? `${r.pcrPct.toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskDailyCovView({ risk }: { risk: PortfolioRiskResponse }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink-muted">
          日频协方差风险分解（近 {risk.windowDays} 交易日）
        </h3>
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          收缩系数 δ={risk.shrinkageIntensity ?? "—"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <RiskMetricMiniCard
          label="组合年化波动"
          value={risk.annualizedVolPct !== null ? `${risk.annualizedVolPct}%` : "—"}
        />
        <RiskMetricMiniCard
          label="组合 Beta"
          value={risk.portfolioBeta !== null ? `${risk.portfolioBeta}` : "—"}
        />
        <RiskMetricMiniCard
          label="分散比 DR"
          value={risk.diversificationRatio !== null ? `${risk.diversificationRatio}×` : "—"}
        />
        <RiskMetricMiniCard
          label="有效押注 ENB / ENH"
          value={`${risk.effectiveNumBets ?? "—"} / ${risk.effectiveNumHoldings ?? "—"}`}
        />
      </div>
      <RiskContribTable rows={risk.contributions} />
      <CorrelationClusterLines clusters={risk.clusters} capPct={risk.clusterCapPct} />
    </section>
  );
}

export function RiskDecompositionSection({ open }: { open: boolean }) {
  const [risk, setRisk] = useState<PortfolioRiskResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    void kanonFetch("/api/portfolio/risk", PortfolioRiskResponseSchema, {
      signal: ctrl.signal,
    }).then((res) => {
      if (!ctrl.signal.aborted && res.ok) setRisk(res.data);
    });
    return () => ctrl.abort();
  }, [open]);

  if (!risk || risk.status === "empty") return null;
  if (risk.basis === "sector_tag") {
    return (
      <section className="rounded-card border border-hairline bg-canvas/40 px-4 py-3 text-xs text-ink-muted">
        日频行情不足 60 个交易日，暂以赛道敞口估算（缺少：
        {risk.missingTickers.join(", ") || "行情同步中"}）。
      </section>
    );
  }
  return <RiskDailyCovView risk={risk} />;
}
