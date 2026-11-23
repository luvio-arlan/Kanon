"use client";

import {
  calculateSensitivityMatrix,
  calculateValuationScenarios,
  type ThesisDetail,
  type ValuationScenarioSummary,
} from "@kanon/core";
import { Button, cn, Input } from "@kanon/ui";
import { IconCheck, IconDeviceFloppy } from "@tabler/icons-react";
import { useState } from "react";
import { LiveOddsBanner } from "./live-odds-banner";
import { ScenarioEditorCard } from "./scenario-editor-card";
import { SensitivityMatrixCard } from "./sensitivity-matrix-card";

type CaseKey = "bear" | "base" | "bull";
type CasePair = { eps: number; peMultiple: number };
type CaseMap = Record<CaseKey, CasePair>;

export interface ValuationWorkbenchProps {
  thesis: ThesisDetail;
  latestSecEps?: number | null;
  saving: boolean;
  onSave: (payload: { currentPrice: number; horizonYears: number } & CaseMap) => Promise<void>;
}

const HORIZONS = [2, 3, 5] as const;
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

function initialCasesFromThesis(thesis: ThesisDetail): CaseMap {
  return {
    bear: {
      eps: thesis.valuationInput.bear.eps,
      peMultiple: thesis.valuationInput.bear.peMultiple,
    },
    base: {
      eps: thesis.valuationInput.base.eps,
      peMultiple: thesis.valuationInput.base.peMultiple,
    },
    bull: {
      eps: thesis.valuationInput.bull.eps,
      peMultiple: thesis.valuationInput.bull.peMultiple,
    },
  };
}

function HorizonSelector({
  horizonYears,
  onHorizon,
}: {
  horizonYears: number;
  onHorizon: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-muted">投资周期</span>
      <div className="inline-flex rounded-pill border border-hairline bg-muted/70 p-1">
        {HORIZONS.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => onHorizon(year)}
            className={cn(
              "cursor-pointer rounded-pill px-3 py-1 font-mono text-xs font-medium transition-colors",
              horizonYears === year
                ? "bg-surface text-ink-primary shadow-card"
                : "text-ink-secondary hover:text-ink-primary",
            )}
          >
            {year} 年
          </button>
        ))}
      </div>
    </div>
  );
}

function PriceAndHorizonBar(props: {
  currentPrice: number;
  horizonYears: number;
  latestSecEps?: number | null;
  onPrice: (next: number) => void;
  onHorizon: (next: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-hairline bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="kanon-current-price" className="text-sm font-medium text-ink-primary">
          当前参考价 ($)
        </label>
        <Input
          id="kanon-current-price"
          type="number"
          min={0.5}
          step={0.5}
          value={props.currentPrice}
          onChange={(e) => props.onPrice(Number(e.target.value) || 0)}
          className="w-28 font-mono tabular-nums"
        />
        {props.latestSecEps && props.latestSecEps > 0 ? (
          <span className="rounded-pill bg-titanium-subtle px-2.5 py-1 font-mono text-xs text-ink-secondary tabular-nums">
            SEC 最新年报 EPS ${props.latestSecEps.toFixed(2)}
          </span>
        ) : null}
      </div>
      <HorizonSelector horizonYears={props.horizonYears} onHorizon={props.onHorizon} />
    </div>
  );
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
          label={meta.label}
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

function computeValuationBundle(safePrice: number, horizonYears: number, cases: CaseMap) {
  const summary = calculateValuationScenarios({ currentPrice: safePrice, horizonYears, ...cases });
  const matrix = calculateSensitivityMatrix({
    currentPrice: safePrice,
    horizonYears,
    bearEps: cases.bear.eps,
    baseEps: cases.base.eps,
    bullEps: cases.bull.eps,
    bearPe: cases.bear.peMultiple,
    basePe: cases.base.peMultiple,
    bullPe: cases.bull.peMultiple,
  });
  return { summary, matrix };
}

function ValuationSaveFooter({
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
  onSave,
}: ValuationWorkbenchProps) {
  const [currentPrice, setCurrentPrice] = useState(thesis.currentPrice);
  const [horizonYears, setHorizonYears] = useState(thesis.horizonYears);
  const [cases, setCases] = useState<CaseMap>(() => initialCasesFromThesis(thesis));
  const safePrice = currentPrice > 0 ? currentPrice : 1;
  const { summary, matrix } = computeValuationBundle(safePrice, horizonYears, cases);
  const patchCase = (key: CaseKey, next: Partial<CasePair>) =>
    setCases((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-primary">Step 4 · 三情景估值赔率计算器</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">
          拖动悲观 / 中性 / 乐观 EPS 与 PE 滑块，结合 5×5 敏感度矩阵算清安全边际与赔率比
        </p>
      </div>
      <LiveOddsBanner summary={summary} />
      <PriceAndHorizonBar
        currentPrice={currentPrice}
        horizonYears={horizonYears}
        latestSecEps={latestSecEps}
        onPrice={setCurrentPrice}
        onHorizon={setHorizonYears}
      />
      <ScenarioCardsGrid
        cases={cases}
        epsRange={computeEpsRange(thesis.valuationInput.bull.eps)}
        summary={summary}
        onPatch={patchCase}
      />
      <SensitivityMatrixCard matrix={matrix} />
      <ValuationSaveFooter
        saving={saving}
        disabled={saving || currentPrice <= 0}
        onSave={() => onSave({ currentPrice: safePrice, horizonYears, ...cases })}
      />
    </div>
  );
}
