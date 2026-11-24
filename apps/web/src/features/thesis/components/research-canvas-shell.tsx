"use client";

import type {
  AgentProposal,
  GlossaryTerm,
  InboundCrossCheck,
  QuarterlyReview,
  SavedAgentRun,
  SecSnapshot,
  ThesisDetail,
  ThesisRevision,
  ThesisSummary,
} from "@kanon/core";
import { cn, KANON_STEP_VARIANTS } from "@kanon/ui";
import { IconFocus2 } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { readByokConfig } from "@/features/ai-settings";
import { useCanvasChromeState } from "../hooks/use-canvas-chrome";
import { applyAgentProposal, useResearchAgent } from "../hooks/use-research-agent";
import { type InitialCopilotState, useResearchCanvas } from "../hooks/use-research-canvas";
import { AgentResearchSheet } from "./agent-research-sheet";
import { CanvasTopbar, type StepId, StepRail } from "./canvas-chrome";
import { CanvasOverlays, StepFooterNav, useCanvasShellActions } from "./canvas-footer-controls";
import { CanvasStepRenderer } from "./canvas-step-renderer";

export interface ResearchCanvasShellProps {
  initialThesis: ThesisDetail;
  allTheses: readonly ThesisSummary[];
  glossary: readonly GlossaryTerm[];
  initialSecSnapshot: SecSnapshot | null;
  initialCopilot: InitialCopilotState;
  initialRevisions: readonly ThesisRevision[];
  initialReviews: readonly QuarterlyReview[];
  initialAgentRun: SavedAgentRun | null;
  inboundCrossChecks: readonly InboundCrossCheck[];
}

function FocusExitPill({ onExit }: { onExit: () => void }) {
  return (
    <div className="no-print mb-4 flex justify-end">
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

interface CanvasMainProps {
  activeStep: StepId;
  direction: number;
  focusMode: boolean;
  ctrl: ReturnType<typeof useResearchCanvas>;
  allTheses: readonly ThesisSummary[];
  inboundCrossChecks: readonly InboundCrossCheck[];
  glossary: readonly GlossaryTerm[];
  promotedRule: string | null;
  onDirtyChange: (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;
  onClearPromoted: () => void;
  onPromoteRule: (rule: string) => void;
  onSelectStep: (step: StepId) => void;
  onExitFocus: () => void;
}

function CanvasMainContent(props: CanvasMainProps) {
  const layoutClass = props.focusMode
    ? "max-w-3xl"
    : "grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[216px_minmax(0,1fr)]";

  return (
    <main className={cn("mx-auto px-6 py-8 sm:px-10", layoutClass)}>
      {props.focusMode ? (
        <FocusExitPill onExit={props.onExitFocus} />
      ) : (
        <StepRail
          activeStep={props.activeStep}
          thesis={props.ctrl.thesis}
          onSelect={props.onSelectStep}
        />
      )}
      <section className="min-w-0">
        <AnimatePresence mode="wait" initial={false} custom={props.direction}>
          <motion.div
            key={props.activeStep}
            custom={props.direction}
            variants={KANON_STEP_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <CanvasStepRenderer
              step={props.activeStep}
              ctrl={props.ctrl}
              allTheses={props.allTheses}
              inboundCrossChecks={props.inboundCrossChecks}
              glossary={props.glossary}
              promotedRule={props.promotedRule}
              onDirtyChange={props.onDirtyChange}
              onClearPromoted={props.onClearPromoted}
              onPromoteRule={props.onPromoteRule}
            />
          </motion.div>
        </AnimatePresence>
        <div className="no-print">
          <StepFooterNav activeStep={props.activeStep} onSelectStep={props.onSelectStep} />
        </div>
      </section>
    </main>
  );
}

function CanvasOverlaysBridge({
  ctrl,
  ui,
  actions,
  agent,
  onApplyProposal,
}: {
  ctrl: ReturnType<typeof useResearchCanvas>;
  ui: ReturnType<typeof useCanvasChromeState>;
  actions: ReturnType<typeof useCanvasShellActions>;
  agent: ReturnType<typeof useResearchAgent>;
  onApplyProposal: (proposal: AgentProposal) => Promise<void>;
}) {
  return (
    <>
      <CanvasOverlays
        thesis={ctrl.thesis}
        deleting={ctrl.deleting}
        saving={ctrl.saving}
        commandOpen={ui.modals.cmd}
        aiModalOpen={ui.modals.ai}
        deleteOpen={ui.modals.del}
        unsavedOpen={ui.pendingNav !== null}
        commandGroups={actions.commandGroups}
        onCommandOpen={(o) => ui.setModal("cmd", o)}
        onAiModalOpen={(o) => ui.setModal("ai", o)}
        onDeleteOpen={(o) => ui.setModal("del", o)}
        onResolveUnsaved={ui.resolvePendingNav}
        onByokChanged={() => ui.setHasByok(Boolean(readByokConfig()))}
        onConfirmDelete={actions.handleConfirmDelete}
      />
      <AgentResearchSheet
        open={ui.modals.agent}
        ticker={ctrl.thesis.ticker}
        companyName={ctrl.thesis.companyName}
        running={agent.running}
        traces={agent.traces}
        briefing={agent.briefing}
        appliedIds={agent.appliedIds}
        onOpenChange={(o) => ui.setModal("agent", o)}
        onRun={agent.runAgent}
        onApplyProposal={onApplyProposal}
      />
    </>
  );
}

function useCanvasBindings(props: ResearchCanvasShellProps) {
  const [promotedRule, setPromotedRule] = useState<string | null>(null);
  const ui = useCanvasChromeState(props.initialThesis.id, props.allTheses);
  const ctrl = useResearchCanvas(
    props.initialThesis,
    props.initialSecSnapshot,
    props.initialCopilot,
    props.initialRevisions,
    props.initialReviews,
  );
  const agent = useResearchAgent(ctrl.thesis.id, props.initialAgentRun);
  const actions = useCanvasShellActions({
    ctrl,
    allTheses: props.allTheses,
    glossary: props.glossary,
    onSelectStep: ui.jumpToStep,
    onToggleFocus: ui.toggleFocus,
    onOpenAgent: () => ui.setModal("agent", true),
    onOpenAi: () => ui.setModal("ai", true),
    onCloseDelete: () => ui.setModal("del", false),
  });
  const promoteRule = (rule: string) => {
    setPromotedRule(rule);
    ui.setModal("agent", false);
    ui.jumpToStep(5);
  };
  return { promotedRule, setPromotedRule, ui, ctrl, agent, actions, promoteRule };
}

export function ResearchCanvasShell(props: ResearchCanvasShellProps) {
  const { promotedRule, setPromotedRule, ui, ctrl, agent, actions, promoteRule } =
    useCanvasBindings(props);

  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CanvasTopbar
        thesis={ctrl.thesis}
        allTheses={props.allTheses}
        hasByok={ui.hasByok}
        focusMode={ui.focusMode}
        onOpenAgent={() => ui.setModal("agent", true)}
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
        allTheses={props.allTheses}
        inboundCrossChecks={props.inboundCrossChecks}
        glossary={props.glossary}
        promotedRule={promotedRule}
        onDirtyChange={ui.setDirtyState}
        onClearPromoted={() => setPromotedRule(null)}
        onPromoteRule={promoteRule}
        onSelectStep={ui.jumpToStep}
        onExitFocus={ui.toggleFocus}
      />
      <CanvasOverlaysBridge
        ctrl={ctrl}
        ui={ui}
        actions={actions}
        agent={agent}
        onApplyProposal={(proposal) =>
          applyAgentProposal({
            proposal,
            ctrl,
            onPromoteExitRule: promoteRule,
            onApplied: agent.markApplied,
          })
        }
      />
    </div>
  );
}
