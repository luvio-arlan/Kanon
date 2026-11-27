"use client";

import type { SecAnnualFinancial } from "@kanon/core";
import { Button } from "@kanon/ui";
import { DriverNumInput } from "../ev-owner-fcf-card";

export interface BaseSeedInputs {
  baseRevCagrPct: number | null;
  baseOperatingMarginPct: number | null;
  sbcPctOfRev: number | null;
  capexPctOfRev: number | null;
  basePe: number | null;
}

const SEED_FIELDS: ReadonlyArray<{ key: keyof BaseSeedInputs; label: string; step: number }> = [
  { key: "baseRevCagrPct", label: "中性营收 CAGR%", step: 1 },
  { key: "baseOperatingMarginPct", label: "中性营业利润%", step: 1 },
  { key: "sbcPctOfRev", label: "SBC 占营收%", step: 0.5 },
  { key: "capexPctOfRev", label: "CapEx 占营收%", step: 0.5 },
  { key: "basePe", label: "中性远期倍数×", step: 1 },
];

function computeHistorical3yCagrPct(annuals: readonly SecAnnualFinancial[]): number | null {
  const valid = annuals.filter((a) => a.revenue !== null && a.revenue > 0);
  if (valid.length < 2) return null;
  const startIdx = Math.max(0, valid.length - 4);
  const start = valid[startIdx];
  const end = valid[valid.length - 1];
  const years = valid.length - 1 - startIdx;
  if (!start?.revenue || !end?.revenue || years <= 0) return null;
  return Number((((end.revenue / start.revenue) ** (1 / years) - 1) * 100).toFixed(1));
}

export function deriveHistoricalSeed(
  annuals: readonly SecAnnualFinancial[],
  latest: SecAnnualFinancial | null,
): BaseSeedInputs {
  const rev = latest && latest.revenue !== null && latest.revenue > 0 ? latest.revenue : null;
  const pct = (val: number | null | undefined) =>
    rev !== null && val != null ? Number(((Math.abs(val) / rev) * 100).toFixed(1)) : null;
  return {
    baseRevCagrPct: computeHistorical3yCagrPct(annuals),
    baseOperatingMarginPct:
      rev !== null && latest?.operatingIncome != null
        ? Number(((latest.operatingIncome / rev) * 100).toFixed(1))
        : null,
    sbcPctOfRev: pct(latest?.sbc),
    capexPctOfRev: pct(latest?.capex),
    basePe: null,
  };
}

export function isSeedComplete(s: BaseSeedInputs): s is { [K in keyof BaseSeedInputs]: number } {
  return (
    s.baseRevCagrPct !== null &&
    s.baseOperatingMarginPct !== null &&
    s.sbcPctOfRev !== null &&
    s.capexPctOfRev !== null &&
    s.basePe !== null &&
    s.basePe > 0
  );
}

export function LinkedSeedSetup(p: {
  seed: BaseSeedInputs;
  onPatchSeed: (patch: Partial<BaseSeedInputs>) => void;
  onInitialize: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-hairline pt-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SEED_FIELDS.map((f) => (
          <DriverNumInput
            key={f.key}
            label={f.label}
            value={p.seed[f.key]}
            step={f.step}
            onChange={(val) => p.onPatchSeed({ [f.key]: val })}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-muted">请补全缺失经营参数后展开三情景联动模型</span>
        <Button
          variant="primary"
          size="sm"
          disabled={!isSeedComplete(p.seed)}
          onClick={p.onInitialize}
        >
          <span>生成三情景模型</span>
        </Button>
      </div>
    </div>
  );
}
