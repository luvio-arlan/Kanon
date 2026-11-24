"use client";

import type {
  GlossaryTerm,
  InboundCrossCheck,
  SecAnnualFinancial,
  ThesisSummary,
} from "@kanon/core";
import { DisciplineJournal } from "@/features/journal";
import { StepBusinessFilter, StepFirstPrinciples, StepHypotheses } from "@/features/research-steps";
import { ValuationWorkbench } from "@/features/valuation";
import type { useResearchCanvas } from "../hooks/use-research-canvas";
import type { StepId } from "./step-rail";

type CanvasController = ReturnType<typeof useResearchCanvas>;

function findLatestSecEps(annuals?: readonly SecAnnualFinancial[]): number | null {
  if (!annuals || annuals.length === 0) return null;
  for (let i = annuals.length - 1; i >= 0; i -= 1) {
    const eps = annuals[i]?.dilutedEps;
    if (typeof eps === "number") return eps;
  }
  return null;
}

type DirtyCallback = (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;

interface EarlyStepsProps {
  step: 1 | 2 | 3;
  ctrl: CanvasController;
  allTheses: readonly ThesisSummary[];
  inboundCrossChecks: readonly InboundCrossCheck[];
  glossary: readonly GlossaryTerm[];
  onDirtyChange: DirtyCallback;
  onPromoteRule: (rule: string) => void;
}

function StepThreeView({
  ctrl,
  allTheses,
  inboundCrossChecks,
  glossary,
  onDirtyChange,
  onPromoteRule,
}: {
  ctrl: CanvasController;
  allTheses: readonly ThesisSummary[];
  inboundCrossChecks: readonly InboundCrossCheck[];
  glossary: readonly GlossaryTerm[];
  onDirtyChange: DirtyCallback;
  onPromoteRule: (rule: string) => void;
}) {
  return (
    <StepFirstPrinciples
      thesis={ctrl.thesis}
      allTheses={allTheses}
      inboundCrossChecks={inboundCrossChecks}
      glossary={glossary}
      secSnapshot={ctrl.secSnapshot}
      secSyncing={ctrl.secSyncing}
      digestLoading={ctrl.copilot.busy === "earnings_digest"}
      digest={ctrl.copilot.digest}
      saving={ctrl.saving}
      onDirtyChange={onDirtyChange}
      onSyncSec={ctrl.syncSec}
      onRunDigest={(sourceText) => ctrl.runCopilot("earnings_digest", sourceText)}
      onSaveCrossChecks={(crossChecks) =>
        ctrl.patchStep({ step: "cross_checks", crossChecks }, "交叉验证记录已保存")
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
        onDirtyChange={p.onDirtyChange}
        onSave={(payload) =>
          p.ctrl.patchStep({ step: "business_filter", ...payload }, "Step 1 商业模式滤镜已保存")
        }
      />
    );
  }
  if (p.step === 2) {
    return (
      <StepHypotheses
        thesis={p.ctrl.thesis}
        glossary={p.glossary}
        saving={p.ctrl.saving}
        redTeamLoading={p.ctrl.copilot.busy === "red_team"}
        redTeam={p.ctrl.copilot.redTeam}
        onDirtyChange={p.onDirtyChange}
        onSave={(hypotheses) =>
          p.ctrl.patchStep(
            { step: "hypotheses", hypotheses },
            `${hypotheses.length} 条核心假设已保存`,
          )
        }
        onSaveCatalysts={(catalysts) =>
          p.ctrl.patchStep({ step: "catalysts", catalysts }, "催化剂日程已保存")
        }
        onRunRedTeam={() => p.ctrl.runCopilot("red_team")}
        onPromoteRedTeamRule={p.onPromoteRule}
      />
    );
  }
  return <StepThreeView {...p} />;
}

function LateSteps({
  step,
  ctrl,
  livePrice,
  promotedRule,
  onDirtyChange,
  onClearPromoted,
}: {
  step: 4 | 5;
  ctrl: CanvasController;
  livePrice?: number | null;
  promotedRule: string | null;
  onDirtyChange: DirtyCallback;
  onClearPromoted: () => void;
}) {
  if (step === 4) {
    return (
      <ValuationWorkbench
        thesis={ctrl.thesis}
        secAnnuals={ctrl.secSnapshot?.annuals}
        latestSecEps={findLatestSecEps(ctrl.secSnapshot?.annuals)}
        saving={ctrl.saving}
        onDirtyChange={onDirtyChange}
        onSave={(valuationInput) =>
          ctrl.patchStep({ step: "valuation", valuationInput }, "三情景估值赔率已保存")
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
  promotedRule: string | null;
  onDirtyChange: DirtyCallback;
  onClearPromoted: () => void;
  onPromoteRule: (rule: string) => void;
}) {
  if (props.step <= 3) {
    return (
      <EarlySteps
        step={props.step as 1 | 2 | 3}
        ctrl={props.ctrl}
        allTheses={props.allTheses}
        inboundCrossChecks={props.inboundCrossChecks}
        glossary={props.glossary}
        onDirtyChange={props.onDirtyChange}
        onPromoteRule={props.onPromoteRule}
      />
    );
  }
  return (
    <LateSteps
      step={props.step as 4 | 5}
      ctrl={props.ctrl}
      livePrice={props.livePrice}
      promotedRule={props.promotedRule}
      onDirtyChange={props.onDirtyChange}
      onClearPromoted={props.onClearPromoted}
    />
  );
}
