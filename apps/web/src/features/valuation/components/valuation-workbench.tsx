"use client";

import {
  checkScenarioMonotonicity,
  type SecAnnualFinancial,
  type ThesisDetail,
  type ValuationModelMode,
} from "@kanon/core";
import { KANON_LENS_VARIANTS, SegmentedTabs } from "@kanon/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AutoSaveStatus } from "@/shared/hooks/use-thesis-step-draft";
import {
  type CaseMap,
  useValuationDraft,
  type ValuationSavePayload,
} from "../lib/use-valuation-draft";
import { LiveOddsBanner } from "./live-odds-banner";
import { computeStableEpsRange, ScenarioCardsGrid } from "./scenario-cards-grid";
import { SensitivityMatrixCard } from "./sensitivity-matrix-card";
import { ValuationControlsBar } from "./valuation-controls-bar";
import { ValuationDriversPanel } from "./valuation-drivers-panel";
import { ValuationReverseDcfPanel } from "./valuation-reverse-dcf-panel";

type ValuationLens = "scenarios" | "drivers" | "reverse";

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
          { id: "drivers", label: "拆解 / EV-FCF" },
          { id: "reverse", label: "Reverse DCF" },
        ]}
      />
    </header>
  );
}

function ScenariosCoreSection({
  epsRange,
  d,
  onExpandCeiling,
}: {
  epsRange: { min: number; max: number; step: number };
  d: ReturnType<typeof useValuationDraft>;
  onExpandCeiling: (eps: number) => void;
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
        epsRange={epsRange}
        summary={d.summary}
        onPatch={d.patchCase}
      />
      <SensitivityMatrixCard
        matrix={d.matrix}
        onSelectBaseCell={(eps, peMultiple) => {
          onExpandCeiling(eps);
          d.patchCase("base", { eps, peMultiple });
          toast.success(`已锚定中性基准 EPS $${eps.toFixed(2)} × ${peMultiple}x`);
        }}
      />
    </>
  );
}

interface LensBodyProps {
  lens: ValuationLens;
  epsRange: { min: number; max: number; step: number };
  secAnnuals: readonly SecAnnualFinancial[];
  latestSecEps: number | null;
  d: ReturnType<typeof useValuationDraft>;
  onExpandCeiling: (eps: number) => void;
  onSwitchToScenarios: () => void;
}

function applyEvAnchor(
  d: ReturnType<typeof useValuationDraft>,
  targets: { bear: number; base: number; bull: number },
  onExpandCeiling: (eps: number) => void,
  onSwitchToScenarios: () => void,
) {
  const maxImplied = Math.max(
    targets.bear / Math.max(1, d.cases.bear.peMultiple),
    targets.base / Math.max(1, d.cases.base.peMultiple),
    targets.bull / Math.max(1, d.cases.bull.peMultiple),
  );
  onExpandCeiling(maxImplied);
  d.applyEvTargetPrices(targets);
  onSwitchToScenarios();
  toast.success(`已按 EV/FCF 锚定三情景（中性 $${targets.base.toFixed(1)}）`);
}

function ValuationLensBody(props: LensBodyProps) {
  const { lens, epsRange, secAnnuals, latestSecEps, d, onExpandCeiling, onSwitchToScenarios } =
    props;
  const content =
    lens === "drivers" ? (
      <ValuationDriversPanel
        currentPrice={d.currentPrice}
        horizonYears={d.horizonYears}
        latestAnnual={secAnnuals[secAnnuals.length - 1] ?? null}
        driverInputs={d.driverInputs}
        onPatchDrivers={d.patchDrivers}
        onApplyBaseEps={(eps) => {
          onExpandCeiling(eps);
          d.patchCase("base", { eps });
          onSwitchToScenarios();
          toast.success(`已回填中性 EPS $${eps.toFixed(2)}`);
        }}
        onApplyEvTargets={(t) => applyEvAnchor(d, t, onExpandCeiling, onSwitchToScenarios)}
      />
    ) : lens === "reverse" ? (
      <ValuationReverseDcfPanel
        summary={d.summary}
        annuals={secAnnuals}
        trailingEps={latestSecEps}
      />
    ) : (
      <ScenariosCoreSection epsRange={epsRange} d={d} onExpandCeiling={onExpandCeiling} />
    );
  return (
    <motion.div
      key={lens}
      variants={KANON_LENS_VARIANTS}
      initial="enter"
      animate="center"
      className="min-h-[420px] space-y-6"
    >
      {content}
    </motion.div>
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
  const expandCeiling = (eps: number) => setCeiling((prev) => Math.max(eps, prev));
  return { epsRange, expandCeiling };
}

export function ValuationWorkbench({
  thesis,
  secAnnuals = [],
  latestSecEps = null,
  onSyncChange,
  onSave,
}: ValuationWorkbenchProps) {
  const d = useValuationDraft({ thesis, onSyncChange, onSave });
  const [lens, setLens] = useState<ValuationLens>("scenarios");
  const { epsRange, expandCeiling } = useStableEpsBounds(
    d.cases,
    latestSecEps,
    thesis.currentPrice,
  );
  const handleModelMode = (mode: ValuationModelMode) => {
    d.setModelMode(mode);
    setLens(mode === "ev_fcf" ? "drivers" : "scenarios");
  };
  return (
    <div className="space-y-6">
      <ValuationHeaderBar lens={lens} onLens={setLens} />
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
