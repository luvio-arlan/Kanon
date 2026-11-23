"use client";

import type { GlossaryTerm, SecAnnualFinancial, SecSnapshot, ThesisDetail } from "@kanon/core";
import { KANON_TRANSITION_FAST } from "@kanon/ui";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { DisciplineJournal } from "@/features/journal";
import { ValuationWorkbench } from "@/features/valuation";
import { type InitialCopilotState, useResearchCanvas } from "../hooks/use-research-canvas";
import { readByokConfig } from "../lib/byok-storage";
import { CanvasTopbar, type StepId, StepRail } from "./canvas-chrome";
import { CanvasOverlays, StepFooterNav, useCanvasShellActions } from "./canvas-footer-controls";
import { StepBusinessFilter } from "./step-business-filter";
import { StepFirstPrinciples } from "./step-first-principles";
import { StepHypotheses } from "./step-hypotheses";

export interface ResearchCanvasShellProps {
  initialThesis: ThesisDetail;
  allTheses: readonly ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  initialSecSnapshot: SecSnapshot | null;
  initialCopilot: InitialCopilotState;
}

type CanvasController = ReturnType<typeof useResearchCanvas>;

function findLatestSecEps(annuals?: readonly SecAnnualFinancial[]): number | null {
  if (!annuals || annuals.length === 0) return null;
  for (let i = annuals.length - 1; i >= 0; i -= 1) {
    const eps = annuals[i]?.dilutedEps;
    if (typeof eps === "number") return eps;
  }
  return null;
}

function renderEarlySteps(
  step: 1 | 2 | 3,
  ctrl: CanvasController,
  glossary: readonly GlossaryTerm[],
) {
  if (step === 1) {
    return (
      <StepBusinessFilter
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
      />
    );
  }
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

function renderLateSteps(step: 4 | 5, ctrl: CanvasController) {
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
      submitting={ctrl.saving}
      memoLoading={ctrl.copilot.busy === "investment_memo"}
      investmentMemo={ctrl.copilot.investmentMemo}
      redTeamExitSuggestion={ctrl.copilot.redTeam?.challenges[0]?.falsificationPath}
      onSubmitDiscipline={ctrl.submitDiscipline}
      onGenerateMemo={() => ctrl.runCopilot("investment_memo")}
    />
  );
}

function CanvasMainContent(props: {
  activeStep: StepId;
  ctrl: CanvasController;
  glossary: readonly GlossaryTerm[];
  onSelectStep: (step: StepId) => void;
  onRequestDelete: () => void;
}) {
  const { activeStep, ctrl, glossary, onSelectStep, onRequestDelete } = props;
  return (
    <main className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-8 sm:px-10 lg:grid-cols-[248px_minmax(0,1fr)]">
      <StepRail
        activeStep={activeStep}
        thesis={ctrl.thesis}
        onSelect={onSelectStep}
        onRequestDelete={onRequestDelete}
      />
      <section className="min-w-0">
        <motion.div
          key={activeStep}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={KANON_TRANSITION_FAST}
        >
          {activeStep <= 3
            ? renderEarlySteps(activeStep as 1 | 2 | 3, ctrl, glossary)
            : renderLateSteps(activeStep as 4 | 5, ctrl)}
        </motion.div>
        <StepFooterNav activeStep={activeStep} onSelectStep={onSelectStep} />
      </section>
    </main>
  );
}

function useCanvasChromeState() {
  const [activeStep, setActiveStep] = useState<StepId>(1);
  const [modals, setModals] = useState({ cmd: false, ai: false, del: false });
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    setHasByok(Boolean(readByokConfig()));
  }, []);

  const jumpToStep = (step: StepId) => {
    setActiveStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const setModal = (key: "cmd" | "ai" | "del", val: boolean) =>
    setModals((prev) => ({ ...prev, [key]: val }));

  return { activeStep, modals, hasByok, setHasByok, jumpToStep, setModal };
}

export function ResearchCanvasShell(props: ResearchCanvasShellProps) {
  const ui = useCanvasChromeState();
  const ctrl = useResearchCanvas(
    props.initialThesis,
    props.initialSecSnapshot,
    props.initialCopilot,
  );
  const { commandGroups, handleConfirmDelete } = useCanvasShellActions({
    ctrl,
    allTheses: props.allTheses,
    glossary: props.glossary,
    onSelectStep: ui.jumpToStep,
    onOpenAi: () => ui.setModal("ai", true),
    onCloseDelete: () => ui.setModal("del", false),
  });

  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CanvasTopbar
        thesis={ctrl.thesis}
        hasByok={ui.hasByok}
        onOpenCommand={() => ui.setModal("cmd", true)}
        onOpenAiSettings={() => ui.setModal("ai", true)}
      />
      <CanvasMainContent
        activeStep={ui.activeStep}
        ctrl={ctrl}
        glossary={props.glossary}
        onSelectStep={ui.jumpToStep}
        onRequestDelete={() => ui.setModal("del", true)}
      />
      <CanvasOverlays
        thesis={ctrl.thesis}
        deleting={ctrl.deleting}
        commandOpen={ui.modals.cmd}
        aiModalOpen={ui.modals.ai}
        deleteOpen={ui.modals.del}
        commandGroups={commandGroups}
        onCommandOpen={(open) => ui.setModal("cmd", open)}
        onAiModalOpen={(open) => ui.setModal("ai", open)}
        onDeleteOpen={(open) => ui.setModal("del", open)}
        onByokChanged={() => ui.setHasByok(Boolean(readByokConfig()))}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
}
