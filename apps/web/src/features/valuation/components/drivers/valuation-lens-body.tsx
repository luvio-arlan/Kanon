"use client";

import { checkScenarioMonotonicity, type SecAnnualFinancial } from "@kanon/core";
import { KANON_LENS_VARIANTS } from "@kanon/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { useValuationDraft } from "../../lib/use-valuation-draft";
import { ScenarioCardsGrid } from "../scenario-cards-grid";
import { SensitivityMatrixCard } from "../sensitivity-matrix-card";
import { ValuationDriversPanel } from "../valuation-drivers-panel";
import { ValuationReverseDcfPanel } from "../valuation-reverse-dcf-panel";
import { InstitutionalModelsPanel } from "./institutional-models-panel";
import { MarketBenchmarksCard } from "./market-benchmarks-card";

export type ValuationLens = "scenarios" | "drivers" | "reverse" | "models" | "benchmarks";

export interface ValuationLensBodyProps {
  thesisId: string;
  ticker: string;
  lens: ValuationLens;
  epsRange: { min: number; max: number; step: number };
  secAnnuals: readonly SecAnnualFinancial[];
  latestSecEps: number | null;
  d: ReturnType<typeof useValuationDraft>;
  onExpandCeiling: (eps: number) => void;
  onSwitchToScenarios: () => void;
  onGoToSec?: () => void;
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

function applyEvAnchor(
  d: ReturnType<typeof useValuationDraft>,
  targets: { bear: number; base: number; bull: number },
  onExpandCeiling: (eps: number) => void,
  onSwitchToScenarios: () => void,
) {
  if (
    !Number.isFinite(targets.bear) ||
    !Number.isFinite(targets.base) ||
    !Number.isFinite(targets.bull) ||
    targets.bear <= 0 ||
    targets.base <= 0 ||
    targets.bull <= 0
  ) {
    toast.error("目标价必须为正数，无法锚定三情景。");
    return;
  }
  const maxImplied = Math.max(
    targets.bear / Math.max(1, d.cases.bear.peMultiple),
    targets.base / Math.max(1, d.cases.base.peMultiple),
    targets.bull / Math.max(1, d.cases.bull.peMultiple),
  );
  onExpandCeiling(maxImplied);
  d.applyEvTargetPrices(targets);
  onSwitchToScenarios();
  toast.success(`已联动锚定三情景（中性 $${targets.base.toFixed(1)}）`);
}

function renderLensPanel(p: ValuationLensBodyProps) {
  const { thesisId, ticker, lens, epsRange, secAnnuals, latestSecEps, d } = p;
  if (lens === "benchmarks")
    return (
      <MarketBenchmarksCard thesisId={thesisId} ticker={ticker} currentPrice={d.currentPrice} />
    );
  if (lens === "models")
    return (
      <InstitutionalModelsPanel
        thesisId={thesisId}
        ticker={ticker}
        currentPrice={d.currentPrice}
        horizonYears={d.horizonYears}
        secAnnuals={secAnnuals}
      />
    );
  if (lens === "reverse")
    return (
      <ValuationReverseDcfPanel
        summary={d.summary}
        annuals={secAnnuals}
        trailingEps={latestSecEps}
      />
    );
  if (lens === "scenarios")
    return <ScenariosCoreSection epsRange={epsRange} d={d} onExpandCeiling={p.onExpandCeiling} />;
  return (
    <ValuationDriversPanel
      currentPrice={d.currentPrice}
      horizonYears={d.horizonYears}
      modelMode={d.modelMode}
      secAnnuals={secAnnuals}
      driverInputs={d.driverInputs}
      onPatchDrivers={d.patchDrivers}
      onApplyEvTargets={(t) => applyEvAnchor(d, t, p.onExpandCeiling, p.onSwitchToScenarios)}
      onGoToSec={p.onGoToSec}
    />
  );
}

export function ValuationLensBody(props: ValuationLensBodyProps) {
  return (
    <motion.div
      key={props.lens}
      variants={KANON_LENS_VARIANTS}
      initial="enter"
      animate="center"
      className="min-h-[420px] space-y-6"
    >
      {renderLensPanel(props)}
    </motion.div>
  );
}
