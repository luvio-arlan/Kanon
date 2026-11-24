"use client";

import { CommandMenu } from "@kanon/ui";
import { AiSettingsModal, readByokConfig } from "@/features/ai-settings";
import { CompareThesesSheet, ImportArchiveModal, PortfolioStressSheet } from "@/features/portfolio";
import type { useCockpitState } from "../../lib/cockpit-state";
import type { LiveMarketQuotesState } from "../../lib/use-live-market-quotes";
import type { usePortfolioOverlayState } from "../../lib/use-portfolio-overlays";
import { NewThesisModal } from "../new-thesis-modal";
import { ThesisPreviewSheet } from "../thesis-preview-sheet";

function PortfolioModals({
  ui,
  ext,
}: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
}) {
  return (
    <>
      <CompareThesesSheet
        open={ext.compareOpen}
        theses={ext.compareTheses}
        onOpenChange={ext.setCompareOpen}
        onClearSelection={ext.clearCompare}
      />
      <ImportArchiveModal
        open={ext.importOpen}
        onOpenChange={ext.setImportOpen}
        onImported={ext.onImported}
      />
      <PortfolioStressSheet
        open={ext.stressOpen}
        theses={ui.theses}
        onOpenChange={ext.setStressOpen}
        onInspectThesis={ui.setPreviewThesis}
      />
    </>
  );
}

export function CockpitOverlays({
  ui,
  ext,
  market,
}: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  market: LiveMarketQuotesState;
}) {
  return (
    <>
      <CommandMenu
        open={ui.modals.cmd}
        onOpenChange={(o) => ui.setModal("cmd", o)}
        groups={ui.commandGroups}
      />
      <ThesisPreviewSheet
        thesis={ui.previewThesis}
        liveQuote={ui.previewThesis ? market.quotes[ui.previewThesis.ticker] : undefined}
        onClose={() => ui.setPreviewThesis(null)}
        onUpdated={ui.replaceThesis}
      />
      <NewThesisModal
        open={ui.modals.create}
        onOpenChange={(o) => ui.setModal("create", o)}
        onCreated={ext.onCreated}
      />
      <AiSettingsModal
        open={ui.modals.ai}
        onOpenChange={(o) => ui.setModal("ai", o)}
        onChanged={() => {
          ui.setHasByok(Boolean(readByokConfig()));
          void market.refresh(true);
        }}
        refreshingPrices={ext.refreshingPrices}
        onRefreshPrices={() => void ext.refreshPrices()}
        onOpenImport={() => ext.setImportOpen(true)}
      />
      <PortfolioModals ui={ui} ext={ext} />
    </>
  );
}
