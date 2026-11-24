"use client";

import {
  checkScenarioMonotonicity,
  type SecAnnualFinancial,
  type ThesisDetail,
  type ValuationScenarioSummary,
} from "@kanon/core";
import { Button, SegmentedTabs } from "@kanon/ui";
import { IconAlertTriangle, IconCheck, IconDeviceFloppy } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { DraftStatusBar } from "@/shared/components/draft-status-bar";
import {
  type CaseKey,
  type CaseMap,
  type CasePair,
  useValuationDraft,
} from "../lib/use-valuation-draft";
import { LiveOddsBanner } from "./live-odds-banner";
import { ScenarioEditorCard } from "./scenario-editor-card";
import { SensitivityMatrixCard } from "./sensitivity-matrix-card";
import { ValuationControlsBar } from "./valuation-controls-bar";
import { ValuationDriversPanel } from "./valuation-drivers-panel";
import { ValuationReverseDcfPanel } from "./valuation-reverse-dcf-panel";

type ValuationLens = "scenarios" | "drivers" | "reverse";

export interface ValuationWorkbenchProps {
  thesis: ThesisDetail;
  secAnnuals?: readonly SecAnnualFinancial[];
  latestSecEps?: number | null;
  saving: boolean;
  onDirtyChange?: (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;
  onSave: (payload: { currentPrice: number; horizonYears: number } & CaseMap) => Promise<void>;
}

const PE_RANGE = { min: 6, max: 60, step: 1 };
const CASE_META: ReadonlyArray<{
  key: CaseKey;
  label: string;
  subtitle: string;
  tone: "warn" | "pass" | "titanium";
}> = [
  { key: "bear", label: "悲观情景", subtitle: "周期下行与估值底线", tone: "warn" },
  { key: "base", label: "中性基准", subtitle: "大概率兑现盈利中枢", tone: "pass" },
  { key: "bull", label: "乐观情景", subtitle: "超预期扩张与双击", tone: "titanium" },
];

function computeEpsRange(initialEps: number) {
  const max = Math.max(Math.ceil(initialEps * 2.4), 10);
  const step = max >= 40 ? 0.5 : 0.1;
  return { min: Math.max(0.5, Number((initialEps * 0.25).toFixed(1))), max, step };
}

function ScenarioCardsGrid({
  cases,
  epsRange,
  summary,
  onPatch,
}: {
  cases: CaseMap;
  epsRange: { min: number; max: number; step: number };
  summary: ValuationScenarioSummary;
  onPatch: (key: CaseKey, next: Partial<CasePair>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {CASE_META.map((meta) => (
        <ScenarioEditorCard
          key={meta.key}
          label={`${meta.label} · ${Math.round(cases[meta.key].probability * 100)}%`}
          subtitle={meta.subtitle}
          tone={meta.tone}
          eps={cases[meta.key].eps}
          peMultiple={cases[meta.key].peMultiple}
          epsRange={epsRange}
          peRange={PE_RANGE}
          result={summary[meta.key]}
          onChangeEps={(eps) => onPatch(meta.key, { eps })}
          onChangePe={(peMultiple) => onPatch(meta.key, { peMultiple })}
        />
      ))}
    </div>
  );
}

function ValuationHeaderBar({
  lens,
  onLens,
}: {
  lens: ValuationLens;
  onLens: (next: ValuationLens) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink-primary">Step 4 · 双引擎估值与赔率工作台</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">
          默认聚焦三情景赔率与 5×5 敏感度矩阵，可按需切换自上而下 EPS / EV-FCF 与 Reverse-DCF 检验
        </p>
      </div>
      <SegmentedTabs
        layoutId="valuation-lens-tabs"
        value={lens}
        onChange={onLens}
        items={[
          { id: "scenarios", label: "核心三情景" },
          { id: "drivers", label: "营收拆解 / EV-FCF" },
          { id: "reverse", label: "Reverse-DCF & TSR" },
        ]}
      />
    </div>
  );
}

function ScenariosCoreSection({
  thesis,
  d,
}: {
  thesis: ThesisDetail;
  d: ReturnType<typeof useValuationDraft>;
}) {
  const mono = checkScenarioMonotonicity({
    bearTarget: d.summary.bear.targetPrice,
    baseTarget: d.summary.base.targetPrice,
    bullTarget: d.summary.bull.targetPrice,
  });
  return (
    <>
      {!mono.isMonotonic && mono.warning ? (
        <div className="flex items-center gap-2 rounded-control border border-status-warn/40 bg-status-warn-soft px-4 py-2 text-xs text-status-warn">
          <IconAlertTriangle size={14} stroke={1.5} />
          <span>{mono.warning}</span>
        </div>
      ) : null}
      <ScenarioCardsGrid
        cases={d.cases}
        epsRange={computeEpsRange(Math.max(thesis.valuationInput.bull.eps, d.cases.bull.eps))}
        summary={d.summary}
        onPatch={d.patchCase}
      />
      <SensitivityMatrixCard
        matrix={d.matrix}
        onSelectBaseCell={(eps, peMultiple) => {
          d.patchCase("base", { eps, peMultiple });
          toast.success(`已将中性基准锚定为 EPS $${eps.toFixed(2)} × ${peMultiple}x`);
        }}
      />
    </>
  );
}

function ValuationLensBody(props: {
  lens: ValuationLens;
  thesis: ThesisDetail;
  secAnnuals: readonly SecAnnualFinancial[];
  latestSecEps: number | null;
  d: ReturnType<typeof useValuationDraft>;
  onSwitchToScenarios: () => void;
}) {
  const { lens, thesis, secAnnuals, latestSecEps, d } = props;
  if (lens === "drivers") {
    return (
      <ValuationDriversPanel
        currentPrice={d.currentPrice}
        horizonYears={d.horizonYears}
        basePe={d.cases.base.peMultiple}
        latestAnnual={secAnnuals[secAnnuals.length - 1] ?? null}
        onApplyBaseEps={(eps) => {
          d.patchCase("base", { eps });
          props.onSwitchToScenarios();
          toast.success(`已将自上而下推导的 EPS $${eps.toFixed(2)} 回填至中性情景`);
        }}
      />
    );
  }
  if (lens === "reverse") {
    return (
      <ValuationReverseDcfPanel
        summary={d.summary}
        annuals={secAnnuals}
        trailingEps={latestSecEps}
      />
    );
  }
  return <ScenariosCoreSection thesis={thesis} d={d} />;
}

function SaveValuationButton(props: { saving: boolean; disabled: boolean; onSave: () => void }) {
  return (
    <div className="flex justify-end">
      <Button variant="primary" size="lg" disabled={props.disabled} onClick={props.onSave}>
        {props.saving ? (
          <IconCheck size={16} stroke={1.5} />
        ) : (
          <IconDeviceFloppy size={16} stroke={1.5} />
        )}
        <span>{props.saving ? "正在写入数据库..." : "保存三情景估值赔率"}</span>
      </Button>
    </div>
  );
}

export function ValuationWorkbench({
  thesis,
  secAnnuals = [],
  latestSecEps = null,
  saving,
  onDirtyChange,
  onSave,
}: ValuationWorkbenchProps) {
  const d = useValuationDraft({ thesis, saving, onDirtyChange, onSave });
  const [lens, setLens] = useState<ValuationLens>("scenarios");

  return (
    <div className="space-y-6">
      <DraftStatusBar draft={d.store} saving={saving} />
      <ValuationHeaderBar lens={lens} onLens={setLens} />
      <LiveOddsBanner summary={d.summary} trailingEps={latestSecEps} />
      <ValuationControlsBar
        currentPrice={d.currentPrice}
        horizonYears={d.horizonYears}
        latestSecEps={latestSecEps}
        activePreset={d.activePreset}
        onPrice={(currentPrice) => d.store.setDraft((prev) => ({ ...prev, currentPrice }))}
        onHorizon={(horizonYears) => d.store.setDraft((prev) => ({ ...prev, horizonYears }))}
        onApplyPreset={d.applyPreset}
      />
      <ValuationLensBody
        lens={lens}
        thesis={thesis}
        secAnnuals={secAnnuals}
        latestSecEps={latestSecEps}
        d={d}
        onSwitchToScenarios={() => setLens("scenarios")}
      />
      <SaveValuationButton
        saving={saving}
        disabled={saving || d.currentPrice <= 0}
        onSave={() => void d.store.save()}
      />
    </div>
  );
}
