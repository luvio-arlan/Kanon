"use client";

import type { ValuationCaseResult } from "@kanon/core";
import { Badge, Card, PrecisionSlider, RollingNumber } from "@kanon/ui";

export interface ScenarioEditorCardProps {
  label: string;
  tone: "warn" | "pass" | "titanium";
  eps: number;
  peMultiple: number;
  epsRange: { min: number; max: number; step: number };
  peRange: { min: number; max: number; step: number };
  result: ValuationCaseResult;
  onChangeEps: (next: number) => void;
  onChangePe: (next: number) => void;
}

function ScenarioMetricHeader({
  label,
  tone,
  result,
}: Pick<ScenarioEditorCardProps, "label" | "tone" | "result">) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-ink-primary">{label}</h4>
        <Badge variant={tone} className="font-mono tabular-nums">
          <RollingNumber
            value={result.returnPct}
            suffix="%"
            decimals={1}
            signDisplay="exceptZero"
          />
        </Badge>
      </div>
      <div className="mt-4 flex items-baseline justify-between border-b border-hairline pb-4">
        <RollingNumber
          value={result.targetPrice}
          prefix="$"
          decimals={1}
          className="text-4xl font-light tracking-[-0.04em] text-ink-primary"
        />
        <span className="font-mono text-sm text-ink-secondary tabular-nums">
          年化 <RollingNumber value={result.cagrPct} suffix="%" decimals={1} />
        </span>
      </div>
    </div>
  );
}

export function ScenarioEditorCard(props: ScenarioEditorCardProps) {
  return (
    <Card className="group flex flex-col justify-between p-6 focus-within:border-strong focus-within:shadow-card-hover">
      <ScenarioMetricHeader label={props.label} tone={props.tone} result={props.result} />
      <div className="mt-4 space-y-4">
        <PrecisionSlider
          label="远期 EPS"
          value={props.eps}
          min={props.epsRange.min}
          max={props.epsRange.max}
          step={props.epsRange.step}
          displayValue={`$${props.eps.toFixed(2)}`}
          onChange={props.onChangeEps}
        />
        <PrecisionSlider
          label="合理 PE"
          value={props.peMultiple}
          min={props.peRange.min}
          max={props.peRange.max}
          step={props.peRange.step}
          displayValue={`${props.peMultiple.toFixed(0)}x`}
          onChange={props.onChangePe}
        />
      </div>
    </Card>
  );
}
