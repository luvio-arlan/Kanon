"use client";

import {
  evaluateHypothesisKpi,
  type Hypothesis,
  type HypothesisKpiEvaluation,
  type HypothesisKpiMetric,
  type HypothesisKpiOperator,
  type HypothesisKpiRule,
  type SecAnnualFinancial,
  type SecQuarterlyFinancial,
} from "@kanon/core";
import { ActionMenu, Badge, Input } from "@kanon/ui";
import { IconCheck, IconChevronDown, IconLink, IconX } from "@tabler/icons-react";

const METRIC_ITEMS: ReadonlyArray<{ id: HypothesisKpiMetric; label: string; unit: string }> = [
  { id: "grossMarginPct", label: "综合毛利率", unit: "%" },
  { id: "revenueCagrPct", label: "营收复合增速", unit: "%" },
  { id: "roicPct", label: "ROIC 投入回报", unit: "%" },
  { id: "fcfConversionPct", label: "FCF 转化率", unit: "%" },
  { id: "sbcPctOfOcf", label: "SBC / 经营现金流", unit: "%" },
  { id: "netCashB", label: "净现金头寸", unit: "$B" },
];

const OP_ITEMS: ReadonlyArray<{ id: HypothesisKpiOperator; label: string }> = [
  { id: ">=", label: "≥" },
  { id: "<=", label: "≤" },
  { id: ">", label: ">" },
  { id: "<", label: "<" },
];

function KpiMetricMenus({
  rule,
  onChange,
}: {
  rule: HypothesisKpiRule;
  onChange: (next: HypothesisKpiRule) => void;
}) {
  const curMetric = METRIC_ITEMS.find((m) => m.id === rule.metricKey) ?? METRIC_ITEMS[0];
  const curOp = OP_ITEMS.find((o) => o.id === rule.operator)?.label ?? "≥";
  return (
    <>
      <ActionMenu
        ariaLabel="选择绑定财务指标"
        triggerClassName="inline-flex h-7 items-center gap-1 rounded-control border border-hairline bg-surface px-2.5 text-xs text-ink-primary hover:border-strong"
        trigger={
          <>
            <span>{curMetric?.label}</span>
            <IconChevronDown size={12} stroke={1.5} className="kanon-chevron text-ink-muted" />
          </>
        }
        items={METRIC_ITEMS.map((m) => ({
          id: m.id,
          label: m.label,
          selected: rule.metricKey === m.id,
          onSelect: () => onChange({ ...rule, metricKey: m.id }),
        }))}
      />
      <ActionMenu
        ariaLabel="比较符号"
        triggerClassName="inline-flex h-7 items-center gap-1 rounded-control border border-hairline bg-surface px-2 font-mono text-xs text-ink-primary hover:border-strong"
        trigger={
          <>
            <span>{curOp}</span>
            <IconChevronDown size={12} stroke={1.5} className="kanon-chevron text-ink-muted" />
          </>
        }
        items={OP_ITEMS.map((o) => ({
          id: o.id,
          label: o.label,
          selected: rule.operator === o.id,
          onSelect: () => onChange({ ...rule, operator: o.id }),
        }))}
      />
    </>
  );
}

function KpiRuleEditor({
  rule,
  onChange,
  onClear,
}: {
  rule: HypothesisKpiRule;
  onChange: (n: HypothesisKpiRule) => void;
  onClear: () => void;
}) {
  const unit = METRIC_ITEMS.find((m) => m.id === rule.metricKey)?.unit ?? "%";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <KpiMetricMenus rule={rule} onChange={onChange} />
      <Input
        type="number"
        step={0.5}
        value={rule.targetValue}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange({ ...rule, targetValue: v });
        }}
        className="h-7 w-20 font-mono text-xs tabular-nums"
      />
      <span className="font-mono text-xs text-ink-muted">{unit}</span>
      <button
        type="button"
        onClick={onClear}
        title="解除自动核验"
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-item text-ink-muted hover:bg-muted hover:text-ink-primary"
      >
        <IconX size={12} stroke={1.5} />
      </button>
    </div>
  );
}

function KpiVerdictReadout({
  item,
  evaluation,
  onSync,
}: {
  item: Hypothesis;
  evaluation: HypothesisKpiEvaluation;
  onSync: () => void;
}) {
  const variant =
    evaluation.passed === true ? "pass" : evaluation.passed === false ? "fail" : "titanium";
  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant}>{evaluation.verdictText}</Badge>
      {evaluation.passed !== null && item.status !== evaluation.suggestedStatus ? (
        <button
          type="button"
          onClick={onSync}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-coral hover:opacity-80"
        >
          <IconCheck size={12} stroke={1.5} />
          <span>同步状态</span>
        </button>
      ) : null}
    </div>
  );
}

export function HypothesisKpiStrip({
  item,
  annuals,
  quarterlies,
  onChange,
}: {
  item: Hypothesis;
  annuals: readonly SecAnnualFinancial[];
  quarterlies: readonly SecQuarterlyFinancial[];
  onChange: (next: Hypothesis) => void;
}) {
  const rule = item.kpiRule ?? null;
  if (!rule) {
    return (
      <div className="flex items-center justify-between border-t border-hairline bg-canvas/25 px-6 py-2.5 sm:px-7">
        <button
          type="button"
          onClick={() =>
            onChange({
              ...item,
              kpiRule: { metricKey: "grossMarginPct", operator: ">=", targetValue: 50 },
            })
          }
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink-primary"
        >
          <IconLink size={13} stroke={1.5} />
          <span>绑定财报自动核验红线</span>
        </button>
      </div>
    );
  }
  const evaluation = evaluateHypothesisKpi(item, annuals, quarterlies);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-hairline bg-canvas/35 px-6 py-2.5 sm:px-7">
      <KpiRuleEditor
        rule={rule}
        onChange={(nextRule) => onChange({ ...item, kpiRule: nextRule })}
        onClear={() => onChange({ ...item, kpiRule: null })}
      />
      {evaluation ? (
        <KpiVerdictReadout
          item={item}
          evaluation={evaluation}
          onSync={() => onChange({ ...item, status: evaluation.suggestedStatus })}
        />
      ) : null}
    </div>
  );
}
