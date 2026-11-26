"use client";

import {
  calculateMultiStageFcffDcf,
  runValuationMonteCarlo,
  type SecAnnualFinancial,
  solveMauboussinImpliedCap,
} from "@kanon/core";
import { Badge, Button, Input } from "@kanon/ui";
import { IconBookmark, IconHistory } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  apiListModelVersions,
  apiSaveModelVersion,
  type SavedModelVersion,
} from "../../lib/model-versions-api";

export interface InstitutionalModelsPanelProps {
  thesisId: string;
  ticker: string;
  currentPrice: number;
  horizonYears: number;
  secAnnuals: readonly SecAnnualFinancial[];
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-control border border-hairline bg-canvas/50 px-3.5 py-2.5">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 font-mono text-base font-semibold text-ink-primary tabular-nums">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-ink-secondary">{sub}</div> : null}
    </div>
  );
}

function ModelInputsGrid({
  vals,
  onChange,
}: {
  vals: { wacc: number; growth: number; margin: number; stc: number };
  onChange: (field: "wacc" | "growth" | "margin" | "stc", val: number) => void;
}) {
  const fields = [
    { id: "wacc" as const, label: "WACC (%)", step: "0.5", value: vals.wacc, fallback: 9 },
    {
      id: "growth" as const,
      label: "高增速 CAGR (%)",
      step: "1",
      value: vals.growth,
      fallback: 12,
    },
    { id: "margin" as const, label: "稳态 EBIT (%)", step: "1", value: vals.margin, fallback: 25 },
    { id: "stc" as const, label: "营收/资本效率", step: "0.2", value: vals.stc, fallback: 2 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {fields.map((f) => (
        <div key={f.id} className="space-y-1 text-xs text-ink-secondary">
          <div>{f.label}</div>
          <Input
            aria-label={f.label}
            type="number"
            step={f.step}
            value={String(f.value)}
            onChange={(e) => onChange(f.id, Number(e.target.value) || f.fallback)}
          />
        </div>
      ))}
    </div>
  );
}

function ModelVersionsList({ versions }: { versions: readonly SavedModelVersion[] }) {
  if (versions.length === 0) return null;
  return (
    <section className="space-y-2.5 rounded-card border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-primary">
        <IconHistory size={14} stroke={1.5} />
        <span>已归档模型快照 ({versions.length})</span>
      </div>
      <div className="divide-y divide-hairline text-xs">
        {versions.slice(0, 5).map((v) => (
          <div key={v.id} className="flex items-center justify-between py-2">
            <span className="font-medium text-ink-primary">
              v{v.versionNum} · {v.label}
            </span>
            <span className="font-mono text-ink-secondary tabular-nums">
              DCF ${Number(v.outputs.fairValuePerShare ?? 0).toFixed(1)} ·{" "}
              {v.createdAt.slice(0, 10)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function buildDcfInput(
  vals: { wacc: number; growth: number; margin: number; stc: number },
  base: { revB: number; sharesM: number; cashB: number; debtB: number; price: number },
  safeWacc: number,
) {
  return {
    baseRevenueB: base.revB,
    highGrowthYears: 5,
    fadeYears: 5,
    initialRevenueGrowthPct: vals.growth,
    terminalGrowthPct: 3.0,
    initialEbitMarginPct: vals.margin,
    terminalEbitMarginPct: vals.margin,
    effectiveTaxRatePct: 21,
    salesToCapitalRatio: Math.max(0.4, vals.stc),
    terminalRonicPct: Math.max(safeWacc + 3, 16),
    waccPct: safeWacc,
    cashAndStInvestmentsB: base.cashB,
    totalDebtB: base.debtB,
    basicSharesM: base.sharesM,
    assumedSharePrice: base.price,
  };
}

function computeModels(
  vals: { wacc: number; growth: number; margin: number; stc: number },
  base: {
    revB: number;
    sharesM: number;
    cashB: number;
    debtB: number;
    price: number;
    years: number;
  },
) {
  const safeWacc = Math.max(5, Math.min(20, vals.wacc));
  const dcf = calculateMultiStageFcffDcf(buildDcfInput(vals, base, safeWacc));
  const baseNopat = Math.max(0.1, (base.revB * (vals.margin / 100) * 0.79 * 1000) / base.sharesM);
  const cap = solveMauboussinImpliedCap({
    currentValue: base.price,
    baseNopat,
    growthRatePct: Math.max(2, vals.growth),
    ronicPct: Math.max(safeWacc + 6, 22),
    waccPct: safeWacc,
  });
  const mc = runValuationMonteCarlo({
    seed: 20261126,
    iterations: 2000,
    currentPrice: base.price,
    baseRevenueB: base.revB,
    dilutedSharesM: base.sharesM,
    netCashB: base.cashB - base.debtB,
    horizonYears: Math.max(3, base.years),
    taxRatePct: 21,
    revenueCagrPct: { mean: vals.growth, stdDev: 4.5, min: -10, max: 45 },
    operatingMarginPct: { mean: vals.margin, stdDev: 3.5, min: 5, max: 60 },
    exitMultiple: { mean: 18, stdDev: 4, min: 8, max: 35 },
  });
  return { dcf, cap, mc };
}

function useInstitutionalModels(p: InstitutionalModelsPanelProps) {
  const latest = p.secAnnuals[p.secAnnuals.length - 1];
  const [vals, setVals] = useState({ wacc: 9, growth: 14, margin: 28, stc: 2 });
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<SavedModelVersion[]>([]);
  const reload = useCallback(
    () => void apiListModelVersions(p.thesisId).then(setVersions),
    [p.thesisId],
  );
  useEffect(() => reload(), [reload]);

  const out = useMemo(
    () =>
      computeModels(vals, {
        revB: latest?.revenue ? Math.max(0.5, latest.revenue / 1e9) : 50,
        sharesM: latest?.dilutedShares ? Math.max(10, latest.dilutedShares / 1e6) : 1000,
        cashB: latest?.cashAndEquiv ? latest.cashAndEquiv / 1e9 : 10,
        debtB: latest?.totalDebt ? latest.totalDebt / 1e9 : 5,
        price: p.currentPrice,
        years: p.horizonYears,
      }),
    [vals, latest, p.currentPrice, p.horizonYears],
  );

  async function snapshot() {
    setSaving(true);
    const ok = await apiSaveModelVersion(p.thesisId, {
      label: `${p.ticker} DCF ${vals.wacc}% WACC`,
      modelKind: "fcff_dcf",
      inputs: vals,
      outputs: { fairValuePerShare: out.dcf.fairValuePerShare, mcP50: out.mc.p50 },
    });
    setSaving(false);
    if (!ok) return void toast.error("模型快照保存失败");
    toast.success(`已归档模型版本（公允价 $${out.dcf.fairValuePerShare.toFixed(1)}）`);
    reload();
  }
  return { vals, setVals, saving, versions, out, snapshot };
}

export function InstitutionalModelsPanel(props: InstitutionalModelsPanelProps) {
  const m = useInstitutionalModels(props);
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-card border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-primary">
              三阶段 FCFF DCF & 蒙特卡洛分布
            </h2>
            <Badge variant="mono">Seed 20261126</Badge>
          </div>
          <Button variant="outline" size="sm" loading={m.saving} onClick={() => void m.snapshot()}>
            <IconBookmark size={14} stroke={1.5} />
            <span>保存模型快照</span>
          </Button>
        </div>
        <ModelInputsGrid
          vals={m.vals}
          onChange={(k, v) => m.setVals((prev) => ({ ...prev, [k]: v }))}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="FCFF 公允价值"
            value={`$${m.out.dcf.fairValuePerShare.toFixed(1)}`}
            sub={`终值占比 ${m.out.dcf.terminalValueSharePct}%`}
          />
          <MetricTile
            label="隐含竞争优势期"
            value={`${m.out.cap.impliedCapYears.toFixed(1)} 年`}
            sub={`成长溢价 ${m.out.cap.pvgoSharePct}%`}
          />
          <MetricTile
            label="蒙特卡洛 P50"
            value={`$${m.out.mc.p50.toFixed(1)}`}
            sub={`P10 $${m.out.mc.p10.toFixed(0)} · P90 $${m.out.mc.p90.toFixed(0)}`}
          />
          <MetricTile
            label="高于现价概率"
            value={`${m.out.mc.probExceedCurrentPricePct.toFixed(1)}%`}
            sub="2,000 次相关抽样"
          />
        </div>
      </section>
      <ModelVersionsList versions={m.versions} />
    </div>
  );
}
