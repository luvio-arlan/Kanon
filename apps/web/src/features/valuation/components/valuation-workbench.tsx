"use client";

import type { SecAnnualFinancial, ThesisDetail, ValuationModelMode } from "@kanon/core";
import { SegmentedTabs } from "@kanon/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { AutoSaveStatus } from "@/shared/hooks/use-thesis-step-draft";
import {
  type CaseMap,
  useValuationDraft,
  type ValuationSavePayload,
} from "../lib/use-valuation-draft";
import { type ValuationLens, ValuationLensBody } from "./drivers/valuation-lens-body";
import { LiveOddsBanner } from "./live-odds-banner";
import { computeStableEpsRange } from "./scenario-cards-grid";
import { ValuationControlsBar } from "./valuation-controls-bar";

export interface ValuationWorkbenchProps {
  thesis: ThesisDetail;
  secAnnuals?: readonly SecAnnualFinancial[];
  latestSecEps?: number | null;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  onSave: (payload: ValuationSavePayload) => Promise<boolean>;
}

function ValuationHeaderBar({
  lens,
  onLens,
}: {
  lens: ValuationLens;
  onLens: (next: ValuationLens) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink-primary">
        三情景估值与赔率
      </h1>
      <SegmentedTabs
        layoutId="valuation-lens-tabs"
        value={lens}
        onChange={onLens}
        items={[
          { id: "scenarios", label: "三情景" },
          { id: "drivers", label: "驱动 / SOTP" },
          { id: "reverse", label: "Reverse DCF" },
          { id: "benchmarks", label: "同业与预期" },
        ]}
      />
    </header>
  );
}

function useStableEpsBounds(
  initialCases: CaseMap,
  latestSecEps: number | null,
  currentPrice: number,
) {
  const [pinnedCases] = useState<CaseMap>(() => initialCases);
  const [ceiling, setCeiling] = useState(0);
  const epsRange = useMemo(
    () =>
      computeStableEpsRange({
        latestSecEps,
        currentPrice,
        initialCases: pinnedCases,
        committedCeiling: ceiling,
      }),
    [latestSecEps, currentPrice, pinnedCases, ceiling],
  );
  return { epsRange, expandCeiling: (eps: number) => setCeiling((prev) => Math.max(eps, prev)) };
}

function ValuationIssuesNotice({ issues }: { issues: ReadonlyArray<{ message: string }> }) {
  if (issues.length === 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-control border border-status-warn/40 bg-status-warn-soft px-4 py-2.5 text-xs text-status-warn">
      <IconAlertTriangle size={14} stroke={1.5} className="mt-0.5 shrink-0" />
      <span>
        估值输入待完善（当前为受限预览，不会写入伪造值）：
        {issues.map((i) => i.message).join(" ")}
      </span>
    </div>
  );
}

export function ValuationWorkbench(props: ValuationWorkbenchProps) {
  const { thesis, secAnnuals = [], latestSecEps = null, onSyncChange, onSave } = props;
  const d = useValuationDraft({ thesis, onSyncChange, onSave });
  const [lens, setLens] = useState<ValuationLens>("scenarios");
  const { epsRange, expandCeiling } = useStableEpsBounds(
    d.cases,
    latestSecEps,
    thesis.currentPrice,
  );
  const handleModelMode = (mode: ValuationModelMode) => {
    d.setModelMode(mode);
    setLens(mode === "pe" ? "scenarios" : "drivers");
  };
  const issues =
    d.validationIssues.length > 0 ? d.validationIssues : (thesis.valuationInputIssues ?? []);
  return (
    <div className="space-y-6">
      <ValuationHeaderBar lens={lens} onLens={setLens} />
      <ValuationIssuesNotice issues={issues} />
      <LiveOddsBanner summary={d.summary} trailingEps={latestSecEps} />
      <ValuationControlsBar
        currentPrice={d.currentPrice}
        horizonYears={d.horizonYears}
        latestSecEps={latestSecEps}
        activePreset={d.activePreset}
        modelMode={d.modelMode}
        bearProb={d.cases.bear.probability}
        baseProb={d.cases.base.probability}
        bullProb={d.cases.bull.probability}
        onPrice={(currentPrice) => d.store.setDraft((prev) => ({ ...prev, currentPrice }))}
        onHorizon={(horizonYears) => d.store.setDraft((prev) => ({ ...prev, horizonYears }))}
        onApplyPreset={d.applyPreset}
        onCustomProb={d.applyProbabilities}
        onModelMode={handleModelMode}
      />
      <ValuationLensBody
        ticker={thesis.ticker}
        lens={lens}
        epsRange={epsRange}
        secAnnuals={secAnnuals}
        latestSecEps={latestSecEps}
        d={d}
        onExpandCeiling={expandCeiling}
        onSwitchToScenarios={() => setLens("scenarios")}
      />
    </div>
  );
}
