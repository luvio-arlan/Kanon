"use client";

import type { PublicUser } from "@kanon/core";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useHasOpened } from "@/shared/hooks/use-has-opened";
import { readByokConfig } from "@/shared/lib/client-provider-storage";
import type { useCanvasChromeState } from "../../hooks/use-canvas-chrome";
import type { useResearchAgent } from "../../hooks/use-research-agent";
import type { useResearchCanvas } from "../../hooks/use-research-canvas";
import { CanvasOverlays, type useCanvasShellActions } from "../canvas-footer-controls";

const AgentResearchSheet = dynamic(
  () => import("../agent-research-sheet").then((m) => m.AgentResearchSheet),
  { ssr: false },
);

function AgentSheetBridge({
  open,
  ticker,
  companyName,
  agent,
  onOpenChange,
  onApplyProposals,
}: {
  open: boolean;
  ticker: string;
  companyName: string;
  agent: ReturnType<typeof useResearchAgent>;
  onOpenChange: (o: boolean) => void;
  onApplyProposals: (proposalIds: readonly string[]) => Promise<void>;
}) {
  const mounted = useHasOpened(open);
  const loadHistory = agent.loadHistory;
  useEffect(() => {
    if (open) void loadHistory();
  }, [loadHistory, open]);
  if (!mounted) return null;
  return (
    <AgentResearchSheet
      open={open}
      ticker={ticker}
      companyName={companyName}
      running={agent.running}
      asking={agent.asking}
      askAnswer={agent.askAnswer}
      activeRunId={agent.runId}
      runsHistory={agent.runsHistory}
      traces={agent.traces}
      partial={agent.partial}
      briefing={agent.briefing}
      appliedIds={agent.appliedIds}
      onOpenChange={onOpenChange}
      onRun={agent.runAgent}
      onStop={agent.stopAgent}
      onAskIc={agent.askIc}
      onSelectRun={agent.selectRun}
      onApplyProposals={onApplyProposals}
    />
  );
}

export function CanvasOverlaysBridge({
  ctrl,
  ui,
  actions,
  agent,
  currentUser,
  onApplyProposals,
}: {
  ctrl: ReturnType<typeof useResearchCanvas>;
  ui: ReturnType<typeof useCanvasChromeState>;
  actions: ReturnType<typeof useCanvasShellActions>;
  agent: ReturnType<typeof useResearchAgent>;
  currentUser?: PublicUser;
  onApplyProposals: (proposalIds: readonly string[]) => Promise<void>;
}) {
  return (
    <>
      <CanvasOverlays
        thesis={ctrl.thesis}
        currentUser={currentUser}
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
      <AgentSheetBridge
        open={ui.modals.agent}
        ticker={ctrl.thesis.ticker}
        companyName={ctrl.thesis.companyName}
        agent={agent}
        onOpenChange={(o) => ui.setModal("agent", o)}
        onApplyProposals={onApplyProposals}
      />
    </>
  );
}
