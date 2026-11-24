"use client";

import type { GlossaryTerm, SecAnnualFinancial } from "@kanon/core";
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

interface EarlyStepsProps {
  step: 1 | 2 | 3;
  ctrl: CanvasController;
  glossary: readonly GlossaryTerm[];
  onPromoteRule: (rule: string) => void;
}

function StepThreeView({
  ctrl,
  glossary,
}: {
  ctrl: CanvasController;
  glossary: readonly GlossaryTerm[];
}) {
  return (
    <StepFirstPrinciples
      thesis={ctrl.thesis}
      glossary={glossary}
      secSnapshot={ctrl.secSnapshot}
      secSyncing={ctrl.secSyncing}
      digestLoading={ctrl.copilot.busy === "earnings_digest"}
      digest={ctrl.copilot.digest}
      saving={ctrl.saving}
      onSyncSec={ctrl.syncSec}
      onRunDigest={(sourceText) => ctrl.runCopilot("earnings_digest", sourceText)}
      onSaveCrossChecks={(crossChecks) =>
        ctrl.patchStep({ step: "cross_checks", crossChecks }, "交叉验证记录已保存")
      }
    />
  );
}

function EarlySteps({ step, ctrl, glossary, onPromoteRule }: EarlyStepsProps) {
  if (step === 1) {
    return (
      <StepBusinessFilter
        key={`${ctrl.thesis.id}-${ctrl.thesis.updatedAt}`}
        thesis={ctrl.thesis}
        glossary={glossary}
        annuals={ctrl.secSnapshot?.annuals}
        saving={ctrl.saving}
        onSave={(p) =>
          ctrl.patchStep({ step: "business_filter", ...p }, "Step 1 商业模式滤镜已保存")
        }
      />
    );
  }
  if (step === 2) {
    return (
      <StepHypotheses
        thesis={ctrl.thesis}
        glossary={glossary}
        saving={ctrl.saving}
        redTeamLoading={ctrl.copilot.busy === "red_team"}
        redTeam={ctrl.copilot.redTeam}
        onSave={(hypotheses) =>
          ctrl.patchStep({ step: "hypotheses", hypotheses }, "3 条核心假设已保存")
        }
        onRunRedTeam={() => ctrl.runCopilot("red_team")}
        onPromoteRedTeamRule={onPromoteRule}
      />
    );
  }
  return <StepThreeView ctrl={ctrl} glossary={glossary} />;
}

function LateSteps({
  step,
  ctrl,
  promotedRule,
  onClearPromoted,
}: {
  step: 4 | 5;
  ctrl: CanvasController;
  promotedRule: string | null;
  onClearPromoted: () => void;
}) {
  if (step === 4) {
    return (
      <ValuationWorkbench
        thesis={ctrl.thesis}
        latestSecEps={findLatestSecEps(ctrl.secSnapshot?.annuals)}
        saving={ctrl.saving}
        onSave={(valuationInput) =>
          ctrl.patchStep({ step: "valuation", valuationInput }, "三情景估值赔率已写入数据库")
        }
      />
    );
  }
  return (
    <DisciplineJournal
      thesis={ctrl.thesis}
      revisions={ctrl.revisions}
      submitting={ctrl.saving}
      memoLoading={ctrl.copilot.busy === "investment_memo"}
      investmentMemo={ctrl.copilot.investmentMemo}
      redTeamExitSuggestion={ctrl.copilot.redTeam?.challenges[0]?.falsificationPath}
      promotedExitRule={promotedRule}
      onClearPromotedRule={onClearPromoted}
      onSubmitDiscipline={ctrl.submitDiscipline}
      onGenerateMemo={() => ctrl.runCopilot("investment_memo")}
    />
  );
}

export function CanvasStepRenderer(props: {
  step: StepId;
  ctrl: CanvasController;
  glossary: readonly GlossaryTerm[];
  promotedRule: string | null;
  onClearPromoted: () => void;
  onPromoteRule: (rule: string) => void;
}) {
  if (props.step <= 3) {
    return (
      <EarlySteps
        step={props.step as 1 | 2 | 3}
        ctrl={props.ctrl}
        glossary={props.glossary}
        onPromoteRule={props.onPromoteRule}
      />
    );
  }
  return (
    <LateSteps
      step={props.step as 4 | 5}
      ctrl={props.ctrl}
      promotedRule={props.promotedRule}
      onClearPromoted={props.onClearPromoted}
    />
  );
}
