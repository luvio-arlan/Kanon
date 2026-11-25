"use client";

import type { ValuationScenarioSummary } from "@kanon/core";
import type { CaseKey, CaseMap, CasePair } from "../lib/use-valuation-draft";
import { ScenarioEditorCard } from "./scenario-editor-card";

const PE_RANGE = { min: 6, max: 60, step: 1 };
const CASE_META = [
  { key: "bear" as const, label: "悲观", tone: "warn" as const },
  { key: "base" as const, label: "中性", tone: "pass" as const },
  { key: "bull" as const, label: "乐观", tone: "titanium" as const },
];

export function computeEpsRange(initialEps: number) {
  const max = Math.max(Math.ceil(initialEps * 2.4), 10);
  const step = max >= 40 ? 0.5 : 0.1;
  return { min: Math.max(0.5, Number((initialEps * 0.25).toFixed(1))), max, step };
}

export function ScenarioCardsGrid({
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
