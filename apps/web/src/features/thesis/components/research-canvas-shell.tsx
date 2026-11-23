"use client";

import type { GlossaryTerm, SecAnnualFinancial, SecSnapshot, ThesisDetail } from "@kanon/core";
import { cn, KANON_TRANSITION_FAST } from "@kanon/ui";
import { IconFocus2 } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { readByokConfig } from "@/features/ai-settings";
import { DisciplineJournal } from "@/features/journal";
import { StepBusinessFilter, StepFirstPrinciples, StepHypotheses } from "@/features/research-steps";
import { ValuationWorkbench } from "@/features/valuation";
import { useCanvasChromeState } from "../hooks/use-canvas-chrome";
import { type InitialCopilotState, useResearchCanvas } from "../hooks/use-research-canvas";
import { CanvasTopbar, type StepId, StepRail } from "./canvas-chrome";
import { CanvasOverlays, StepFooterNav, useCanvasShellActions } from "./canvas-footer-controls";

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

function FocusExitPill({ onExit }: { onExit: () => void }) {
  return (
    <div className="mb-4 flex justify-end">
      <button
        type="button"
        onClick={onExit}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-hairline bg-surface px-3 py-1 text-xs text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
      >
        <IconFocus2 size={13} stroke={1.5} />
        <span>退出专注模式 (F)</span>
      </button>
    </div>
  );
}

function CanvasMainContent(props: {
  activeStep: StepId;
  direction: number;
  focusMode: boolean;
  ctrl: CanvasController;
  glossary: readonly GlossaryTerm[];
  onSelectStep: (step: StepId) => void;
  onExitFocus: () => void;
}) {
  const { activeStep, direction, focusMode, ctrl, glossary, onSelectStep, onExitFocus } = props;
  return (
    <main
      className={cn(
        "mx-auto px-6 py-8 sm:px-10",
        focusMode
          ? "max-w-3xl"
          : "grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[208px_minmax(0,1fr)]",
      )}
    >
      {focusMode ? (
        <FocusExitPill onExit={onExitFocus} />
      ) : (
        <StepRail activeStep={activeStep} thesis={ctrl.thesis} onSelect={onSelectStep} />
      )}
      <section className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, x: direction * 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -10 }}
            transition={KANON_TRANSITION_FAST}
          >
            {activeStep <= 3
              ? renderEarlySteps(activeStep as 1 | 2 | 3, ctrl, glossary)
              : renderLateSteps(activeStep as 4 | 5, ctrl)}
          </motion.div>
        </AnimatePresence>
        <StepFooterNav activeStep={activeStep} onSelectStep={onSelectStep} />
      </section>
    </main>
  );
}

function CanvasShellOverlays(props: {
  ctrl: CanvasController;
  ui: ReturnType<typeof useCanvasChromeState>;
  actions: ReturnType<typeof useCanvasShellActions>;
}) {
  const { ctrl, ui, actions } = props;
  return (
    <CanvasOverlays
      thesis={ctrl.thesis}
      deleting={ctrl.deleting}
      commandOpen={ui.modals.cmd}
      aiModalOpen={ui.modals.ai}
      deleteOpen={ui.modals.del}
      commandGroups={actions.commandGroups}
      onCommandOpen={(o) => ui.setModal("cmd", o)}
      onAiModalOpen={(o) => ui.setModal("ai", o)}
      onDeleteOpen={(o) => ui.setModal("del", o)}
      onByokChanged={() => ui.setHasByok(Boolean(readByokConfig()))}
      onConfirmDelete={actions.handleConfirmDelete}
    />
  );
}

export function ResearchCanvasShell(props: ResearchCanvasShellProps) {
  const ui = useCanvasChromeState(props.initialThesis.id, props.allTheses);
  const ctrl = useResearchCanvas(
    props.initialThesis,
    props.initialSecSnapshot,
    props.initialCopilot,
  );
  const actions = useCanvasShellActions({
    ctrl,
    allTheses: props.allTheses,
    glossary: props.glossary,
    onSelectStep: ui.jumpToStep,
    onToggleFocus: ui.toggleFocus,
    onOpenAi: () => ui.setModal("ai", true),
    onCloseDelete: () => ui.setModal("del", false),
  });

  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CanvasTopbar
        thesis={ctrl.thesis}
        hasByok={ui.hasByok}
        focusMode={ui.focusMode}
        onOpenCommand={() => ui.setModal("cmd", true)}
        onOpenAiSettings={() => ui.setModal("ai", true)}
        onToggleFocus={ui.toggleFocus}
        onRequestDelete={() => ui.setModal("del", true)}
      />
      <CanvasMainContent
        activeStep={ui.nav.step}
        direction={ui.nav.dir}
        focusMode={ui.focusMode}
        ctrl={ctrl}
        glossary={props.glossary}
        onSelectStep={ui.jumpToStep}
        onExitFocus={ui.toggleFocus}
      />
      <CanvasShellOverlays ctrl={ctrl} ui={ui} actions={actions} />
    </div>
  );
}
