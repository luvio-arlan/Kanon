"use client";

import { checkScenarioMonotonicity, type SecAnnualFinancial, type ThesisDetail } from "@kanon/core";
import { Button, KANON_LENS_VARIANTS, SegmentedTabs } from "@kanon/ui";
import { IconAlertTriangle, IconDeviceFloppy } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { DraftStatusBar } from "@/shared/components/draft-status-bar";
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
  saving: boolean;
  onDirtyChange?: (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;
  onSave: (payload: { currentPrice: number; horizonYears: number } & CaseMap) => Promise<void>;
}

function ValuationHeaderBar({
  lens,
  onLens,
}: {
  lens: ValuationLens;
  onLens: (next: ValuationLens) => void;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="h-[1.5px] w-7 bg-accent-coral" />
          <span className="font-mono text-xs tracking-[0.12em] text-ink-muted">STEP 04</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink-primary">
            三情景估值与赔率
          </h1>
          <span className="kanon-serif-italic text-2xl">Valuation</span>
        </div>
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
          toast.success(`已将自上而下推导的 EPS $${eps.toFixed(2)} 回填至中性情景`);
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

function SaveValuationButton(props: { saving: boolean; disabled: boolean; onSave: () => void }) {
  return (
    <div className="flex justify-end">
      <Button
        variant="primary"
        size="lg"
        loading={props.saving}
        disabled={props.disabled}
        onClick={props.onSave}
      >
        {!props.saving ? <IconDeviceFloppy size={16} stroke={1.5} /> : null}
        <span>{props.saving ? "保存中..." : "保存估值赔率"}</span>
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
