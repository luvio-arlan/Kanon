"use client";

import type { SecAnnualFinancial } from "@kanon/core";
import { Button, formatMoney, Input } from "@kanon/ui";
import { IconBookmark, IconHistory } from "@tabler/icons-react";
import type { SavedModelVersion } from "../../lib/model-versions-api";
import { type CoreModelInputs, useInstitutionalModels } from "../../lib/use-institutional-models";
import {
  type ImplicitAssumptions,
  ImplicitAssumptionsBar,
  UnifiedValuationBand,
} from "./valuation-band-strip";

export interface InstitutionalModelsPanelProps {
  thesisId: string;
  ticker: string;
  currentPrice: number;
  horizonYears: number;
  secAnnuals: readonly SecAnnualFinancial[];
}

function ModelInputsGrid({
  vals,
  onChange,
}: {
  vals: CoreModelInputs;
  onChange: (field: keyof CoreModelInputs, raw: string) => void;
}) {
  const fields: ReadonlyArray<{ id: keyof CoreModelInputs; label: string; step: string }> = [
    { id: "wacc", label: "WACC (%)", step: "0.5" },
    { id: "growth", label: "高增速 CAGR (%)", step: "1" },
    { id: "margin", label: "稳态 EBIT (%)", step: "1" },
    { id: "stc", label: "营收/资本效率", step: "0.2" },
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
            value={String(vals[f.id])}
            onChange={(e) => onChange(f.id, e.target.value)}
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
              DCF{" "}
              {formatMoney(Number(v.outputs.fairValuePerShare ?? 0), "USD", {
                maximumFractionDigits: 1,
              })}{" "}
              · {v.createdAt.slice(0, 10)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function InstitutionalModelsPanel(props: InstitutionalModelsPanelProps) {
  const m = useInstitutionalModels(props);
  const updateCore = (field: keyof CoreModelInputs, raw: string) => {
    const parsed = raw.trim() === "" ? 0 : Number(raw);
    if (Number.isFinite(parsed)) m.setVals((prev) => ({ ...prev, [field]: parsed }));
  };
  const updateImplicit = (field: keyof ImplicitAssumptions, raw: string) => {
    const parsed = raw.trim() === "" ? 0 : Number(raw);
    if (Number.isFinite(parsed)) m.setImplicit((prev) => ({ ...prev, [field]: parsed }));
  };

  if (!m.base || !m.out) {
    return (
      <section className="rounded-card border border-hairline bg-surface p-5 text-xs text-ink-muted">
        暂无 SEC 营收与稀释股本基数，请先在 Step 3 同步财报后启用现金流折现模型。
      </section>
    );
  }
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-card border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink-primary">
            三阶段 FCFF DCF & 现值分布（基期 {m.base.fiscalYear}）
          </h2>
          <Button variant="outline" size="sm" loading={m.saving} onClick={() => void m.snapshot()}>
            <IconBookmark size={14} stroke={1.5} />
            <span>保存快照</span>
          </Button>
        </div>
        <ModelInputsGrid vals={m.vals} onChange={updateCore} />
        <ImplicitAssumptionsBar vals={m.implicit} onChange={updateImplicit} />
        <UnifiedValuationBand
          dcfFairValue={m.out.dcf.fairValuePerShare}
          mcP10={m.out.mc.p10}
          mcP50={m.out.mc.p50}
          mcP90={m.out.mc.p90}
          currentPrice={props.currentPrice}
          probAboveCurrent={m.out.mc.probExceedCurrentPricePct}
          impliedCapYears={m.out.cap.impliedCapYears}
          terminalSharePct={m.out.dcf.terminalValueSharePct}
          valueDestroyingGrowth={m.out.dcf.valueDestroyingGrowth}
        />
      </section>
      <ModelVersionsList versions={m.versions} />
    </div>
  );
}
