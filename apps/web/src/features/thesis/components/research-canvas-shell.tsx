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
import { Button, cn, KANON_STEP_VARIANTS, WorkbenchShell } from "@kanon/ui";
import { IconFocus2 } from "@tabler/icons-react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useState } from "react";
import { readByokConfig } from "@/features/ai-settings";
import { useHasOpened } from "@/shared/hooks/use-has-opened";
import { useCanvasChromeState } from "../hooks/use-canvas-chrome";
import { applyAgentProposal, useResearchAgent } from "../hooks/use-research-agent";
import { type InitialCopilotState, useResearchCanvas } from "../hooks/use-research-canvas";
import { useThesisLiveQuote } from "../hooks/use-thesis-live-quote";
import { buildMobileChrome, ResearchSidebar, type StepId } from "./canvas-chrome";
import { CanvasContextRibbon } from "./canvas-context-ribbon";
import { CanvasOverlays, StepFooterNav, useCanvasShellActions } from "./canvas-footer-controls";
import { CanvasStepRenderer } from "./canvas-step-renderer";

const AgentResearchSheet = dynamic(
  () => import("./agent-research-sheet").then((m) => m.AgentResearchSheet),
  { ssr: false },
);

export interface ResearchCanvasShellProps {
  initialThesis: ThesisDetail;
  initialStep?: StepId;
  allTheses: readonly ThesisSummary[];
  glossary: readonly GlossaryTerm[];
  initialSecSnapshot: SecSnapshot | null;
  initialCopilot: InitialCopilotState;
  initialRevisions: readonly ThesisRevision[];
  initialReviews: readonly QuarterlyReview[];
  initialAgentRun: SavedAgentRun | null;
  inboundCrossChecks: readonly InboundCrossCheck[];
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
  const agentMounted = useHasOpened(ui.modals.agent);
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
      {agentMounted ? (
        <AgentResearchSheet
          open={ui.modals.agent}
          ticker={ctrl.thesis.ticker}
          companyName={ctrl.thesis.companyName}
          running={agent.running}
          traces={agent.traces}
          partial={agent.partial}
          briefing={agent.briefing}
          appliedIds={agent.appliedIds}
          onOpenChange={(o) => ui.setModal("agent", o)}
          onRun={agent.runAgent}
          onApplyProposal={onApplyProposal}
        />
      ) : null}
    </>
  );
}

function useCanvasBindings(props: ResearchCanvasShellProps) {
  const [promotedRule, setPromotedRule] = useState<string | null>(null);
  const ui = useCanvasChromeState(props.initialThesis.id, props.allTheses, props.initialStep ?? 1);
  const ctrl = useResearchCanvas(
    props.initialThesis,
    props.initialSecSnapshot,
    props.initialCopilot,
    props.initialRevisions,
    props.initialReviews,
  );
  const agent = useResearchAgent(ctrl.thesis.id, props.initialAgentRun);
  const live = useThesisLiveQuote(ctrl.thesis.ticker);
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
  return { promotedRule, setPromotedRule, ui, ctrl, agent, live, actions, promoteRule };
}

function StageTopBanner({ b }: { b: ReturnType<typeof useCanvasBindings> }) {
  const { ui, ctrl, live } = b;
  if (ui.focusMode) {
    return (
      <div className="no-print mb-6 flex justify-end">
        <Button variant="outline" size="sm" onClick={ui.toggleFocus}>
          <IconFocus2 size={15} stroke={1.5} />
          <span>退出专注模式 (F)</span>
        </Button>
      </div>
    );
  }
  return (
    <CanvasContextRibbon
      thesis={ctrl.thesis}
      activeStep={ui.nav.step}
      liveQuote={live.quote}
      onSelectStep={ui.jumpToStep}
      onOpenAgent={() => ui.setModal("agent", true)}
    />
  );
}

function CanvasStageSection(p: {
  props: ResearchCanvasShellProps;
  b: ReturnType<typeof useCanvasBindings>;
}) {
  const { ui, ctrl, live, promotedRule, setPromotedRule, promoteRule } = p.b;
  return (
    <div
      className={cn(
        "w-full px-5 pb-10 pt-5 sm:px-8 lg:px-10 lg:pt-5",
        ui.focusMode ? "mx-auto max-w-4xl" : "max-w-[1440px]",
      )}
    >
      <StageTopBanner b={p.b} />
      <section className="min-h-[540px] min-w-0">
        <motion.div
          key={ui.nav.step}
          custom={ui.nav.dir}
          variants={KANON_STEP_VARIANTS}
          initial="enter"
          animate="center"
        >
          <CanvasStepRenderer
            step={ui.nav.step}
            ctrl={ctrl}
            livePrice={live.quote?.effectivePrice}
            allTheses={p.props.allTheses}
            inboundCrossChecks={p.props.inboundCrossChecks}
            glossary={p.props.glossary}
            promotedRule={promotedRule}
            onDirtyChange={ui.setDirtyState}
            onClearPromoted={() => setPromotedRule(null)}
            onPromoteRule={promoteRule}
          />
        </motion.div>
        <div className="no-print">
          <StepFooterNav activeStep={ui.nav.step} onSelectStep={ui.jumpToStep} />
        </div>
      </section>
    </div>
  );
}

export function ResearchCanvasShell(props: ResearchCanvasShellProps) {
  const b = useCanvasBindings(props);
  const { ui, ctrl, agent, actions, promoteRule } = b;
  const openAgent = () => ui.setModal("agent", true);
  const apply = (proposal: AgentProposal) =>
    applyAgentProposal({
      proposal,
      ctrl,
      onPromoteExitRule: promoteRule,
      onApplied: agent.markApplied,
    });
  const mobile = buildMobileChrome(ctrl.thesis, openAgent);
  return (
    <>
      <WorkbenchShell
        hideSidebar={ui.focusMode}
        mobileTitle={mobile.title}
        mobileActions={mobile.actions}
        sidebar={(ctx) => (
          <ResearchSidebar
            thesis={ctrl.thesis}
            allTheses={props.allTheses}
            activeStep={ui.nav.step}
            collapsed={ctx.collapsed}
            onToggleCollapse={ctx.onToggleCollapse}
            onCloseMobile={ctx.closeMobile}
            onSelectStep={ui.jumpToStep}
            onOpenAgent={openAgent}
            onOpenCommand={() => ui.setModal("cmd", true)}
            onOpenSettings={() => ui.setModal("ai", true)}
            onToggleFocus={ui.toggleFocus}
          />
        )}
      >
        <CanvasStageSection props={props} b={b} />
      </WorkbenchShell>
      <CanvasOverlaysBridge
        ctrl={ctrl}
        ui={ui}
        actions={actions}
        agent={agent}
        onApplyProposal={apply}
      />
    </>
  );
}
