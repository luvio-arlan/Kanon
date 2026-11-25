"use client";

import {
  calculateCognitiveCalibration,
  type DisciplineAlphaRow,
  type QuarterlyReview,
  type ThesisDetail,
} from "@kanon/core";
import {
  Badge,
  Card,
  KANON_FADE_UP_ITEM,
  KANON_STAGGER_CONTAINER,
  RollingNumber,
  StatCard,
} from "@kanon/ui";
import { IconBrain, IconChartDots3, IconMoodSmile, IconShieldCheck } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

const ACTION_LABEL: Record<DisciplineAlphaRow["action"], string> = {
  buy: "首次建仓",
  add: "纪律加仓",
  trim: "分批减仓",
  hold: "耐心持有",
  pass: "果断放弃",
};

function AlphaAuditTable({ rows }: { rows: readonly DisciplineAlphaRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-ink-muted">
        暂无交易留痕样本，完成首次纪律记录后将自动追踪决策锚点相对现价的认知 Alpha。
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
        <span className="text-sm font-semibold text-ink-primary">历史决策锚点 Alpha 回测</span>
        <span className="font-mono text-xs text-ink-muted">对照最新参考价</span>
      </div>
      <div className="divide-y divide-hairline">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-muted/35"
          >
            <div className="flex items-center gap-2.5">
              <Badge variant="titanium">{ACTION_LABEL[row.action]}</Badge>
              <span className="font-mono text-xs text-ink-secondary tabular-nums">
                锚点 ${row.priceAnchor.toFixed(2)} → 现价 ${row.currentPrice.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
              <span className={row.deltaPct >= 0 ? "text-status-pass" : "text-accent-coral"}>
                {row.deltaPct > 0 ? "+" : ""}
                {row.deltaPct.toFixed(1)}%
              </span>
              <Badge variant={row.favorable ? "pass" : "warn"}>
                {row.favorable ? "方向一致" : "待复盘"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

type CalReport = ReturnType<typeof calculateCognitiveCalibration>;

function formatReturnDelta(report: CalReport): string {
  if (report.avgBenchmarkAlphaPct !== null) {
    const sign = report.avgBenchmarkAlphaPct > 0 ? "+" : "";
    return `相对基准 ${sign}${report.avgBenchmarkAlphaPct}%`;
  }
  if (report.avgEntryReturnPct !== null) {
    const sign = report.avgEntryReturnPct > 0 ? "+" : "";
    return `建仓 ${sign}${report.avgEntryReturnPct}%`;
  }
  return "等待样本";
}

function formatDriftCaption(report: CalReport): string {
  if (report.avgTargetDriftPct === null) return `共 ${report.quarterlyVerdictCount} 条季报裁决`;
  const sign = report.avgTargetDriftPct > 0 ? "+" : "";
  return `目标价实现偏差 ${sign}${report.avgTargetDriftPct}%`;
}

function buildGateCard(report: CalReport) {
  const passed = report.zeroLeverageGatePassed;
  return {
    label: "零杠杆门禁 & Brier",
    icon: <IconShieldCheck size={16} stroke={1.5} />,
    value:
      report.brierScore !== null ? (
        <RollingNumber value={report.brierScore} decimals={3} />
      ) : (
        <span>0.00×</span>
      ),
    caption: passed ? "零杠杆门禁通过 · Brier 越低越准" : "存在杠杆偏离",
    delta: passed ? "门禁通过" : "门禁预警",
    deltaTone: (passed ? "pass" : "warn") as "pass" | "warn",
  };
}

function buildCalibrationCards(report: CalReport) {
  const favDelta =
    report.favorableDecisionRatePct !== null
      ? `顺向 ${report.favorableDecisionRatePct}%`
      : "待验证";
  const hasStrength = report.strengthenedRatePct !== null;
  return [
    {
      label: "真实校准分",
      icon: <IconBrain size={16} stroke={1.5} />,
      value:
        report.decisionCount > 0 ? (
          <RollingNumber value={report.calibrationScore} decimals={0} />
        ) : (
          <span>—</span>
        ),
      caption: "剔除门禁保底分，仅计实盘样本",
      delta: report.calibrationLabel,
      deltaTone: (report.calibrationScore >= 76 ? "pass" : "neutral") as "pass" | "neutral",
    },
    buildGateCard(report),
    {
      label: "冷静决策占比",
      icon: <IconMoodSmile size={16} stroke={1.5} />,
      value: <RollingNumber value={report.calmDecisionPct} suffix="%" decimals={0} />,
      caption: `共 ${report.decisionCount} 笔留痕`,
      delta: favDelta,
      deltaTone: (report.calmDecisionPct >= 80 ? "pass" : "warn") as "pass" | "warn",
    },
    {
      label: "季报强化与基准 Alpha",
      icon: <IconChartDots3 size={16} stroke={1.5} />,
      value: hasStrength ? (
        <RollingNumber value={report.strengthenedRatePct ?? 0} suffix="%" decimals={0} />
      ) : (
        <span>—</span>
      ),
      caption: formatDriftCaption(report),
      delta: formatReturnDelta(report),
      deltaTone: ((report.avgEntryReturnPct ?? 0) >= 0 ? "pass" : "warn") as "pass" | "warn",
    },
  ];
}

function CalibrationStatsGrid({
  report,
}: {
  report: ReturnType<typeof calculateCognitiveCalibration>;
}) {
  const items = buildCalibrationCards(report);
  return (
    <motion.div
      variants={KANON_STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => (
        <motion.div key={item.label} variants={KANON_FADE_UP_ITEM}>
          <StatCard {...item} className="h-full" />
        </motion.div>
      ))}
    </motion.div>
  );
}

export function CognitiveCalibrationPanel({
  thesis,
  reviews,
  livePrice,
}: {
  thesis: ThesisDetail;
  reviews: readonly QuarterlyReview[];
  livePrice?: number | null;
}) {
  const report = useMemo(
    () => calculateCognitiveCalibration(thesis, reviews, livePrice),
    [thesis, reviews, livePrice],
  );
  return (
    <div className="space-y-5">
      <CalibrationStatsGrid report={report} />
      <AlphaAuditTable rows={report.entryAlphaRows} />
    </div>
  );
}
