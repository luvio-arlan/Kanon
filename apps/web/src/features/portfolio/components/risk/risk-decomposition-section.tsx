"use client";

import { type PortfolioRiskResponse, PortfolioRiskResponseSchema } from "@kanon/core";
import { useEffect, useState } from "react";
import { kanonFetch } from "@/shared/lib/kanon-fetch";
import { CorrelationClusterLines } from "./correlation-cluster-lines";

function RiskHairlineMetric(p: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="text-xs text-ink-muted">{p.label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-ink-primary tabular-nums">
        {p.value}
      </div>
    </div>
  );
}

function RiskContribTable({ rows }: { rows: PortfolioRiskResponse["contributions"] }) {
  return (
    <div className="overflow-x-auto border-y border-hairline">
      <table className="w-full min-w-[440px] text-left text-xs">
        <thead className="border-b border-hairline text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-medium">标的</th>
            <th className="px-3 py-2 text-right font-medium">NAV 权重</th>
            <th className="px-3 py-2 text-right font-medium">独立波动</th>
            <th className="px-3 py-2 text-right font-medium">边际 MCR</th>
            <th className="px-3 py-2 text-right font-medium">风险占比 PCR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.ticker}>
              <td className="px-3 py-2 font-medium text-ink-primary">{r.ticker}</td>
              <td className="px-3 py-2 text-right text-ink-secondary">{r.weightPct.toFixed(1)}%</td>
              <td className="px-3 py-2 text-right text-ink-secondary">
                {r.standaloneVolPct !== null ? `${r.standaloneVolPct.toFixed(1)}%` : "—"}
              </td>
              <td className="px-3 py-2 text-right text-ink-secondary">
                {r.mcrPct !== null ? `${r.mcrPct.toFixed(1)}%` : "—"}
              </td>
              <td className="px-3 py-2 text-right font-medium text-ink-primary">
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink-muted">
          账本日频风险分解（近 {risk.windowDays} 交易日）
        </h3>
        {risk.cashWeightPct !== null ? (
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            现金 {risk.cashWeightPct.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-hairline border-y border-hairline sm:grid-cols-4 sm:divide-y-0">
        <RiskHairlineMetric
          label="组合年化波动"
          value={risk.annualizedVolPct !== null ? `${risk.annualizedVolPct}%` : "—"}
        />
        <RiskHairlineMetric
          label="组合 Beta"
          value={risk.portfolioBeta !== null ? `${risk.portfolioBeta}` : "—"}
        />
        <RiskHairlineMetric
          label="分散比 DR"
          value={risk.diversificationRatio !== null ? `${risk.diversificationRatio}×` : "—"}
        />
        <RiskHairlineMetric
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
  if (risk.basis === "insufficient_history") {
    return (
      <section className="border-y border-hairline py-3 text-xs text-ink-muted">
        账本持仓日频行情不足 60 个交易日（缺少：{risk.missingTickers.join(", ") || "行情同步中"}）。
      </section>
    );
  }
  return <RiskDailyCovView risk={risk} />;
}
