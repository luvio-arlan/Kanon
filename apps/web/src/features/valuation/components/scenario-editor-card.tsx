"use client";

import type { ValuationCaseResult } from "@kanon/core";
import { Badge, Card, PrecisionSlider, RollingNumber } from "@kanon/ui";

export interface ScenarioEditorCardProps {
  label: string;
  subtitle: string;
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
  subtitle,
  tone,
  result,
}: Pick<ScenarioEditorCardProps, "label" | "subtitle" | "tone" | "result">) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-base font-semibold text-ink-primary">{label}</h4>
          <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
        </div>
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
          className="text-3xl font-semibold tracking-tight text-ink-primary"
        />
        <span className="text-xs text-ink-secondary">
          年化 <RollingNumber value={result.cagrPct} suffix="%" decimals={1} />
        </span>
      </div>
    </div>
  );
}

export function ScenarioEditorCard(props: ScenarioEditorCardProps) {
  return (
    <Card className="flex flex-col justify-between p-5">
      <ScenarioMetricHeader
        label={props.label}
        subtitle={props.subtitle}
        tone={props.tone}
        result={props.result}
      />
      <div className="mt-4 space-y-4">
        <PrecisionSlider
          label="远期每股收益 (EPS)"
          value={props.eps}
          min={props.epsRange.min}
          max={props.epsRange.max}
          step={props.epsRange.step}
          displayValue={`$${props.eps.toFixed(2)}`}
          onChange={props.onChangeEps}
        />
        <PrecisionSlider
          label="合理市盈率 (PE)"
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
