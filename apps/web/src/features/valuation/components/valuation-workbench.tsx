"use client";

import { checkScenarioMonotonicity, type SecAnnualFinancial, type ThesisDetail } from "@kanon/core";
import { KANON_LENS_VARIANTS, SegmentedTabs } from "@kanon/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import type { AutoSaveStatus } from "@/shared/hooks/use-thesis-step-draft";
import { type CaseMap, useValuationDraft } from "../lib/use-valuation-draft";
import { LiveOddsBanner } from "./live-odds-banner";
import { computeEpsRange, ScenarioCardsGrid } from "./scenario-cards-grid";
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
  onSave: (payload: { currentPrice: number; horizonYears: number } & CaseMap) => Promise<boolean>;
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
          toast.success(`已锚定中性基准 EPS $${eps.toFixed(2)} × ${peMultiple}x`);
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
  const content =
    lens === "drivers" ? (
      <ValuationDriversPanel
        currentPrice={d.currentPrice}
        horizonYears={d.horizonYears}
        basePe={d.cases.base.peMultiple}
        latestAnnual={secAnnuals[secAnnuals.length - 1] ?? null}
        onApplyBaseEps={(eps) => {
          d.patchCase("base", { eps });
          props.onSwitchToScenarios();
          toast.success(`已回填中性 EPS $${eps.toFixed(2)}`);
        }}
      />
    ) : lens === "reverse" ? (
      <ValuationReverseDcfPanel
        summary={d.summary}
        annuals={secAnnuals}
        trailingEps={latestSecEps}
      />
    ) : (
      <ScenariosCoreSection thesis={thesis} d={d} />
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

export function ValuationWorkbench({
  thesis,
  secAnnuals = [],
  latestSecEps = null,
  onSyncChange,
  onSave,
}: ValuationWorkbenchProps) {
  const d = useValuationDraft({ thesis, onSyncChange, onSave });
  const [lens, setLens] = useState<ValuationLens>("scenarios");

  return (
    <div className="space-y-6">
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
    </div>
  );
}
