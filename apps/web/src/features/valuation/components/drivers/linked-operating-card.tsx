"use client";

import {
  calculateLinkedOperatingModel,
  deriveDefaultLinkedDrivers,
  type LinkedOperatingDrivers,
  type LinkedOperatingModelResult,
  type OperatingCaseDrivers,
  type SecAnnualFinancial,
} from "@kanon/core";
import { Badge, Button, Card } from "@kanon/ui";
import { IconArrowDownRight, IconTableOptions } from "@tabler/icons-react";
import { DriverNumInput } from "../ev-owner-fcf-card";

type CaseKey = "bear" | "base" | "bull";

const CASE_ROWS: ReadonlyArray<{ key: CaseKey; label: string }> = [
  { key: "bear", label: "悲观" },
  { key: "base", label: "中性" },
  { key: "bull", label: "乐观" },
];

const DRIVER_FIELDS: ReadonlyArray<{
  key: keyof OperatingCaseDrivers;
  label: string;
  step: number;
}> = [
  { key: "revenueCagrPct", label: "营收增速%", step: 1 },
  { key: "targetOperatingMarginPct", label: "营业利润%", step: 1 },
  { key: "sbcPctOfRev", label: "SBC/营收%", step: 0.5 },
  { key: "capexPctOfRev", label: "CapEx%", step: 0.5 },
  { key: "annualShareChangePct", label: "股本变动%", step: 0.5 },
  { key: "terminalMultiple", label: "终值倍数×", step: 1 },
];

function CaseDriverRow(p: {
  label: string;
  val: OperatingCaseDrivers;
  targetPrice: number;
  eps: number;
  ownerFcfB: number;
  onPatch: (next: Partial<OperatingCaseDrivers>) => void;
}) {
  return (
    <div className="grid grid-cols-2 items-end gap-2.5 py-3 sm:grid-cols-7">
      <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:block">
        <span className="text-xs font-semibold text-ink-primary">{p.label}</span>
        <div className="font-mono text-xs text-accent-coral tabular-nums">
          ${p.targetPrice.toFixed(1)} · EPS ${p.eps.toFixed(1)}
        </div>
        <div className="font-mono text-xs text-ink-muted tabular-nums">FCF ${p.ownerFcfB}B</div>
      </div>
      {DRIVER_FIELDS.map((f) => (
        <DriverNumInput
          key={f.key}
          label={f.label}
          value={p.val[f.key]}
          step={f.step}
          onChange={(nextVal) => p.onPatch({ [f.key]: nextVal })}
        />
      ))}
    </div>
  );
}

function resolveInitialLinkedDrivers(
  latestAnnual: SecAnnualFinancial | null,
): LinkedOperatingDrivers {
  const hasRev = Boolean(latestAnnual?.revenue);
  const rev = latestAnnual?.revenue ?? 1;
  return deriveDefaultLinkedDrivers({
    baseRevCagrPct: 14,
    baseOperatingMarginPct:
      hasRev && latestAnnual?.operatingIncome ? (latestAnnual.operatingIncome / rev) * 100 : 28,
    sbcPctOfRev: hasRev && latestAnnual?.sbc ? (Math.abs(latestAnnual.sbc) / rev) * 100 : 2.5,
    capexPctOfRev: hasRev && latestAnnual?.capex ? (Math.abs(latestAnnual.capex) / rev) * 100 : 9,
    basePe: 22,
  });
}

function LinkedModelFooter({
  model,
  onApply,
}: {
  model: LinkedOperatingModelResult;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3.5">
      <div className="font-mono text-xs text-ink-secondary tabular-nums">
        中性远期营收 <strong className="text-ink-primary">${model.base.endingRevenueB}B</strong> ·
        期间累积 FCF <strong className="text-ink-primary">${model.base.cumulativeFcfB}B</strong> ·
        年化 <strong className="text-accent-coral">{model.base.cagrPct}%</strong>
      </div>
      <Button variant="primary" size="sm" onClick={onApply}>
        <IconArrowDownRight size={14} stroke={1.5} />
        <span>联动写入三情景</span>
      </Button>
    </div>
  );
}

interface LinkedOperatingCardProps {
  currentPrice: number;
  horizonYears: number;
  currentRevenueB: number;
  currentSharesM: number;
  cashB: number;
  totalDebtB: number;
  latestAnnual: SecAnnualFinancial | null;
  linkedDrivers?: LinkedOperatingDrivers;
  onChangeDrivers: (next: LinkedOperatingDrivers) => void;
  onApplyAllCases: (targets: { bear: number; base: number; bull: number }) => void;
}

export function LinkedOperatingCard(props: LinkedOperatingCardProps) {
  const drivers = props.linkedDrivers ?? resolveInitialLinkedDrivers(props.latestAnnual);
  const model = calculateLinkedOperatingModel({ ...props, drivers });
  const patchCase = (key: CaseKey, patch: Partial<OperatingCaseDrivers>) =>
    props.onChangeDrivers({ ...drivers, [key]: { ...drivers[key], ...patch } });
  const handleApply = () =>
    props.onApplyAllCases({
      bear: model.bear.evFcfTargetPrice,
      base: model.base.evFcfTargetPrice,
      bull: model.bull.evFcfTargetPrice,
    });
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconTableOptions size={16} stroke={1.5} className="text-ink-muted" />
          <h3 className="text-sm font-semibold text-ink-primary">
            三情景联动经营与现金流模型（{props.horizonYears} 年）
          </h3>
        </div>
        <Badge variant="titanium">中性期末净现金 ${model.base.endingNetCashB}B</Badge>
      </div>
      <div className="divide-y divide-hairline">
        {CASE_ROWS.map((row) => (
          <CaseDriverRow
            key={row.key}
            label={row.label}
            val={drivers[row.key]}
            targetPrice={model[row.key].evFcfTargetPrice}
            eps={model[row.key].impliedEps}
            ownerFcfB={model[row.key].endingOwnerFcfB}
            onPatch={(p) => patchCase(row.key, p)}
          />
        ))}
      </div>
      <LinkedModelFooter model={model} onApply={handleApply} />
    </Card>
  );
}
