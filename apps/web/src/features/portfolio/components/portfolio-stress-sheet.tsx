"use client";

import { calculatePortfolioStress, type ThesisDetail } from "@kanon/core";
import { Button, Sheet } from "@kanon/ui";
import { IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react";
import { useMemo } from "react";
import { SizingLadderRow, StressKpiStrip, StressScenarioRow } from "./portfolio-stress-sections";

export interface PortfolioStressSheetProps {
  open: boolean;
  theses: readonly ThesisDetail[];
  onOpenChange: (open: boolean) => void;
  onInspectThesis: (thesis: ThesisDetail) => void;
}

function StressSheetFooter({
  hasBearAlert,
  onClose,
}: {
  hasBearAlert: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
        {hasBearAlert ? (
          <>
            <IconAlertTriangle size={14} stroke={1.5} className="text-status-warn" />
            <span>共振熊市组合回撤超 15%，建议检查单一赛道集中度与现金缓冲。</span>
          </>
        ) : (
          <>
            <IconShieldCheck size={14} stroke={1.5} className="text-status-pass" />
            <span>当前零杠杆仓位与现金缓冲处于稳健抗压区间。</span>
          </>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onClose}>
        关闭
      </Button>
    </div>
  );
}

function StressSheetBody({
  report,
  onInspectId,
}: {
  report: ReturnType<typeof calculatePortfolioStress>;
  onInspectId: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <StressKpiStrip report={report} />
      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-ink-muted">情景压力测试</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {report.scenarios.map((scenario) => (
            <StressScenarioRow key={scenario.id} scenario={scenario} />
          ))}
        </div>
      </section>
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-ink-muted">资金配置阶梯</h3>
          {report.topSectorName ? (
            <span className="font-mono text-xs text-ink-muted tabular-nums">
              第一赛道：{report.topSectorName} ({report.topSectorWeightPct}%)
            </span>
          ) : null}
        </div>
        <div className="divide-y divide-hairline rounded-card border border-hairline bg-surface px-4 py-2">
          {report.sizingRows.map((row) => (
            <SizingLadderRow key={row.id} row={row} onInspect={() => onInspectId(row.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function PortfolioStressSheet({
  open,
  theses,
  onOpenChange,
  onInspectThesis,
}: PortfolioStressSheetProps) {
  const report = useMemo(() => calculatePortfolioStress(theses), [theses]);
  const thesisById = useMemo(() => new Map(theses.map((t) => [t.id, t])), [theses]);

  const handleInspect = (id: string) => {
    const found = thesisById.get(id);
    if (!found) return;
    onOpenChange(false);
    onInspectThesis(found);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="组合压力测试"
      footer={
        <StressSheetFooter
          hasBearAlert={report.weightedBearImpactPct <= -15}
          onClose={() => onOpenChange(false)}
        />
      }
    >
      <StressSheetBody report={report} onInspectId={handleInspect} />
    </Sheet>
  );
}
