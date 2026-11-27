"use client";

import type {
  GlossaryTerm,
  InboundCrossCheck,
  SecAnnualFinancial,
  ThesisSummary,
} from "@kanon/core";
import dynamic from "next/dynamic";
import { StepBusinessFilter } from "@/features/research-steps";
import type { AutoSaveStatus } from "@/shared/hooks/use-thesis-step-draft";
import type { useResearchCanvas } from "../hooks/use-research-canvas";
import type { StepId } from "./step-rail";

const StepSkeleton = () => (
  <div className="space-y-5" aria-hidden="true">
    <div className="kanon-shimmer h-16 w-72 rounded-control" />
    <div className="kanon-shimmer h-64 w-full rounded-card border border-hairline" />
  </div>
);

const StepHypotheses = dynamic(
  () => import("@/features/research-steps/public-step2").then((m) => m.StepHypotheses),
  { ssr: false, loading: StepSkeleton },
);
const StepFirstPrinciples = dynamic(
  () => import("@/features/research-steps/public-step3").then((m) => m.StepFirstPrinciples),
  { ssr: false, loading: StepSkeleton },
);
const ValuationWorkbench = dynamic(
  () => import("@/features/valuation").then((m) => m.ValuationWorkbench),
  { ssr: false, loading: StepSkeleton },
);
const DisciplineJournal = dynamic(
  () => import("@/features/journal").then((m) => m.DisciplineJournal),
  { ssr: false, loading: StepSkeleton },
);

type CanvasController = ReturnType<typeof useResearchCanvas>;

function findLatestSecEps(annuals?: readonly SecAnnualFinancial[]): number | null {
  if (!annuals || annuals.length === 0) return null;
  for (let i = annuals.length - 1; i >= 0; i -= 1) {
    const eps = annuals[i]?.dilutedEps;
    if (typeof eps === "number") return eps;
  }
  return null;
}

type SyncCallback = (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;

interface RestatementRef {
  concept: string;
  periodEnd: string;
  originalValue: number;
  restatedValue: number;
  restatedAccession: string;
}

interface EarlyStepsProps {
  step: 1 | 2 | 3;
  ctrl: CanvasController;
  allTheses: readonly ThesisSummary[];
  inboundCrossChecks: readonly InboundCrossCheck[];
  glossary: readonly GlossaryTerm[];
  restatements?: readonly RestatementRef[];
  onSyncChange: SyncCallback;
  onPromoteRule: (rule: string) => void;
  onSelectStep: (step: StepId) => void;
}

function StepThreeView({
  ctrl,
  allTheses,
  inboundCrossChecks,
  glossary,
  restatements,
  onSyncChange,
  onPromoteRule,
}: {
  ctrl: CanvasController;
  allTheses: readonly ThesisSummary[];
  inboundCrossChecks: readonly InboundCrossCheck[];
  glossary: readonly GlossaryTerm[];
  restatements?: readonly RestatementRef[];
  onSyncChange: SyncCallback;
  onPromoteRule: (rule: string) => void;
}) {
  return (
    <StepFirstPrinciples
      thesis={ctrl.thesis}
      allTheses={allTheses}
      inboundCrossChecks={inboundCrossChecks}
      glossary={glossary}
      secSnapshot={ctrl.secSnapshot}
      restatements={restatements}
      secSyncing={ctrl.secSyncing}
      researchNotes={ctrl.researchNotes}
      digestLoading={ctrl.copilot.busy === "earnings_digest"}
      digest={ctrl.copilot.digest}
      onSyncChange={onSyncChange}
      onSyncSec={ctrl.syncSec}
      onSecSnapshotSaved={ctrl.setSecSnapshot}
      onResearchNotesChange={ctrl.setResearchNotes}
      onRunDigest={(sourceText) => ctrl.runCopilot("earnings_digest", sourceText)}
      onSaveCrossChecks={(crossChecks) =>
        ctrl.patchStep({ step: "cross_checks", crossChecks }, undefined, { silent: true })
      }
      onPromoteExitRule={onPromoteRule}
    />
  );
}

function EarlySteps(p: EarlyStepsProps) {
  if (p.step === 1) {
    return (
      <StepBusinessFilter
        thesis={p.ctrl.thesis}
        glossary={p.glossary}
        annuals={p.ctrl.secSnapshot?.annuals}
        quarterlies={p.ctrl.secSnapshot?.quarterlies}
        saving={p.ctrl.saving}
        onJumpToStep={p.onSelectStep}
        onSyncChange={p.onSyncChange}
        onSave={(payload, opts) =>
          p.ctrl.patchStep(
            { step: "business_filter", ...payload },
            opts?.silent ? undefined : "已更新归档状态",
            opts,
          )
        }
      />
    );
  }
  if (p.step === 2) {
    return (
      <StepHypotheses
        thesis={p.ctrl.thesis}
        glossary={p.glossary}
        annuals={p.ctrl.secSnapshot?.annuals}
        quarterlies={p.ctrl.secSnapshot?.quarterlies}
        redTeamLoading={p.ctrl.copilot.busy === "red_team"}
        redTeam={p.ctrl.copilot.redTeam}
        onSyncChange={p.onSyncChange}
        onSave={(hypotheses) =>
          p.ctrl.patchStep({ step: "hypotheses", hypotheses }, undefined, { silent: true })
        }
        onSaveCatalysts={(catalysts) =>
          p.ctrl.patchStep({ step: "catalysts", catalysts }, undefined, { silent: true })
        }
        onRunRedTeam={() => p.ctrl.runCopilot("red_team")}
        onPromoteRedTeamRule={p.onPromoteRule}
      />
    );
  }
  return <StepThreeView {...p} />;
}

interface LateStepsProps {
  step: 4 | 5;
  ctrl: CanvasController;
  livePrice?: number | null;
  promotedRule: string | null;
  onSyncChange: SyncCallback;
  onClearPromoted: () => void;
  onSelectStep: (step: StepId) => void;
}

function LateSteps(p: LateStepsProps) {
  const { step, ctrl, livePrice, promotedRule, onSyncChange, onClearPromoted } = p;
  if (step === 4) {
    return (
      <ValuationWorkbench
        key={ctrl.thesis.id}
        thesis={ctrl.thesis}
        secAnnuals={ctrl.secSnapshot?.annuals}
        latestSecEps={findLatestSecEps(ctrl.secSnapshot?.annuals)}
        onSyncChange={onSyncChange}
        onGoToSec={() => p.onSelectStep(3)}
        onSave={({ modelMode, driverInputs, ...valuationInput }) =>
          ctrl.patchStep(
            { step: "valuation", valuationInput, modelMode, driverInputs },
            undefined,
            { silent: true },
          )
        }
      />
    );
  }
  return (
    <DisciplineJournal
      thesis={ctrl.thesis}
      livePrice={livePrice}
      revisions={ctrl.revisions}
      reviews={ctrl.reviews}
      submitting={ctrl.saving}
      memoLoading={ctrl.copilot.busy === "investment_memo"}
      investmentMemo={ctrl.copilot.investmentMemo}
      redTeamExitSuggestion={ctrl.copilot.redTeam?.challenges[0]?.falsificationPath}
      promotedExitRule={promotedRule}
      onClearPromotedRule={onClearPromoted}
      onSubmitDiscipline={ctrl.submitDiscipline}
      onSubmitReview={ctrl.submitQuarterlyReview}
      onPositionUpdated={(updated) => ctrl.applyMutation({ thesis: updated })}
      onGenerateMemo={() => ctrl.runCopilot("investment_memo")}
    />
  );
}

export function CanvasStepRenderer(props: {
  step: StepId;
  ctrl: CanvasController;
  livePrice?: number | null;
  allTheses: readonly ThesisSummary[];
  inboundCrossChecks: readonly InboundCrossCheck[];
  glossary: readonly GlossaryTerm[];
  restatements?: readonly RestatementRef[];
  promotedRule: string | null;
  onSyncChange: SyncCallback;
  onClearPromoted: () => void;
  onPromoteRule: (rule: string) => void;
  onSelectStep: (step: StepId) => void;
}) {
  if (props.step <= 3) {
    return <EarlySteps {...props} step={props.step as 1 | 2 | 3} />;
  }
  return <LateSteps {...props} step={props.step as 4 | 5} />;
}
