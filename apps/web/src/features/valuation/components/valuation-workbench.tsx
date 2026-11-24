"use client";

import type { ThesisDetail, ValuationScenarioSummary } from "@kanon/core";
import { Button } from "@kanon/ui";
import { IconCheck, IconDeviceFloppy } from "@tabler/icons-react";
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

export interface ValuationWorkbenchProps {
  thesis: ThesisDetail;
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

function ValuationHeadingAndSave({
  saving,
  disabled,
  onSave,
}: {
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end">
      <Button variant="primary" size="lg" disabled={disabled} onClick={onSave}>
        {saving ? (
          <IconCheck size={16} stroke={1.5} />
        ) : (
          <IconDeviceFloppy size={16} stroke={1.5} />
        )}
        <span>{saving ? "正在写入数据库..." : "保存三情景估值赔率"}</span>
      </Button>
    </div>
  );
}

export function ValuationWorkbench({
  thesis,
  latestSecEps,
  saving,
  onDirtyChange,
  onSave,
}: ValuationWorkbenchProps) {
  const d = useValuationDraft({ thesis, saving, onDirtyChange, onSave });

  return (
    <div className="space-y-6">
      <DraftStatusBar draft={d.store} saving={saving} />
      <div>
        <h2 className="text-lg font-semibold text-ink-primary">Step 4 · 三情景估值赔率计算器</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">
          拖动悲观 / 中性 / 乐观 EPS 与 PE 滑块，结合反向估值预期与 5×5 敏感度矩阵算清安全边际
        </p>
      </div>
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
      <ScenarioCardsGrid
        cases={d.cases}
        epsRange={computeEpsRange(thesis.valuationInput.bull.eps)}
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
      <ValuationHeadingAndSave
        saving={saving}
        disabled={saving || d.currentPrice <= 0}
        onSave={() => void d.store.save()}
      />
    </div>
  );
}
