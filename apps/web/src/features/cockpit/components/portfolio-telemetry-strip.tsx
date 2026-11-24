"use client";

import {
  calculateResearchReadiness,
  type PortfolioAnalytics,
  type ThesisDetail,
} from "@kanon/core";
import { RollingNumber, StatCard } from "@kanon/ui";
import {
  IconArrowRight,
  IconChartPie,
  IconScale,
  IconShieldCheck,
  IconStack2,
} from "@tabler/icons-react";
import { useMemo } from "react";

const PIPELINE_STEPS: ReadonlyArray<{ step: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { step: 1, label: "商业初筛" },
  { step: 2, label: "核心假设" },
  { step: 3, label: "财报印证" },
  { step: 4, label: "估值赔率" },
  { step: 5, label: "交易纪律" },
];

function computePipelineCounts(theses: readonly ThesisDetail[]): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const t of theses) {
    calculateResearchReadiness(t).steps.forEach((s, idx) => {
      if (s.complete) counts[idx] = (counts[idx] ?? 0) + 1;
    });
  }
  return counts;
}

function OddsValue({ value, activeCount }: { value: number | null; activeCount: number }) {
  if (activeCount === 0) return <span>—</span>;
  if (value === null) return <span>∞</span>;
  return <RollingNumber value={value} suffix="×" decimals={2} />;
}

function MarginValue({ value }: { value: number | null }) {
  if (value === null) return <span>—</span>;
  return <RollingNumber value={value} suffix="%" decimals={1} />;
}

function ResearchPipelineRibbon({
  theses,
  analytics,
  onOpenStressTest,
}: {
  theses: readonly ThesisDetail[];
  analytics: PortfolioAnalytics;
  onOpenStressTest: () => void;
}) {
  const active = useMemo(() => theses.filter((t) => t.status !== "archived_veto"), [theses]);
  const counts = useMemo(() => computePipelineCounts(active), [active]);
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-hairline bg-surface px-5 py-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-mono text-xs font-medium tracking-[0.06em] text-ink-muted">
          五步纪律漏斗
        </span>
        {PIPELINE_STEPS.map((item, idx) => (
          <div key={item.step} className="inline-flex items-baseline gap-1.5 text-sm">
            <span className="text-ink-secondary">{item.label}</span>
            <span className="font-mono text-xs font-semibold text-ink-primary tabular-nums">
              {counts[idx]}/{active.length}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onOpenStressTest}
        className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-accent-coral"
      >
        <span className="font-mono tabular-nums">
          仓位 {analytics.totalWeightPct}% · 现金 {analytics.cashBufferPct}%
        </span>
        <IconArrowRight size={14} stroke={1.5} />
      </button>
    </div>
  );
}

function TelemetryStatGrid({
  analytics,
  onOpenStressTest,
}: {
  analytics: PortfolioAnalytics;
  onOpenStressTest: () => void;
}) {
  const cagr = analytics.averageBaseCagrPct;
  const cagrDelta = cagr !== null ? `年化 ${cagr.toFixed(1)}%` : "—";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="跟踪标的"
        icon={<IconStack2 size={16} stroke={1.5} />}
        value={<RollingNumber value={analytics.activeCount} decimals={0} />}
        caption="平均研究完成度"
        delta={`${analytics.averageReadinessPct}%`}
        deltaTone={analytics.averageReadinessPct >= 80 ? "pass" : "neutral"}
      />
      <StatCard
        label="组合平均赔率"
        icon={<IconScale size={16} stroke={1.5} />}
        value={
          <OddsValue value={analytics.averageRiskReward} activeCount={analytics.activeCount} />
        }
        caption="高赔率优选标的"
        delta={`${analytics.attractiveCount} 只`}
        deltaTone={analytics.attractiveCount > 0 ? "pass" : "neutral"}
      />
      <StatCard
        label="平均安全边际"
        icon={<IconShieldCheck size={16} stroke={1.5} />}
        value={<MarginValue value={analytics.averageMarginOfSafetyPct} />}
        caption="中性三年复合预期"
        delta={cagrDelta}
        deltaTone={(analytics.averageMarginOfSafetyPct ?? 0) >= 25 ? "pass" : "neutral"}
      />
      <StatCard
        label="已配仓位"
        icon={<IconChartPie size={16} stroke={1.5} />}
        value={<RollingNumber value={analytics.totalWeightPct} suffix="%" decimals={0} />}
        caption="点击运行压力测试"
        delta={`现金 ${analytics.cashBufferPct}%`}
        deltaTone={analytics.overCapTickers.length > 0 ? "fail" : "neutral"}
        onClick={onOpenStressTest}
      />
    </div>
  );
}

export function PortfolioTelemetryStrip({
  analytics,
  theses,
  onOpenStressTest,
}: {
  analytics: PortfolioAnalytics;
  theses: readonly ThesisDetail[];
  onOpenStressTest: () => void;
}) {
  return (
    <div className="space-y-4">
      <TelemetryStatGrid analytics={analytics} onOpenStressTest={onOpenStressTest} />
      <ResearchPipelineRibbon
        theses={theses}
        analytics={analytics}
        onOpenStressTest={onOpenStressTest}
      />
    </div>
  );
}
