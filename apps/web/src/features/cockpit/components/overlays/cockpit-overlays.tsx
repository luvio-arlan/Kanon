"use client";

import type { PublicUser } from "@kanon/core";
import { CommandMenu } from "@kanon/ui";
import dynamic from "next/dynamic";
import { readByokConfig, type SettingsTabId } from "@/features/ai-settings";
import { useHasOpened } from "@/shared/hooks/use-has-opened";
import type { useCockpitState } from "../../lib/cockpit-state";
import type { LiveMarketQuotesState } from "../../lib/use-live-market-quotes";
import type { usePortfolioOverlayState } from "../../lib/use-portfolio-overlays";

const AiSettingsModal = dynamic(
  () => import("@/features/ai-settings").then((m) => m.AiSettingsModal),
  { ssr: false },
);
const CompareThesesSheet = dynamic(
  () => import("@/features/portfolio").then((m) => m.CompareThesesSheet),
  { ssr: false },
);
const ImportArchiveModal = dynamic(
  () => import("@/features/portfolio").then((m) => m.ImportArchiveModal),
  { ssr: false },
);
const PortfolioStressSheet = dynamic(
  () => import("@/features/portfolio").then((m) => m.PortfolioStressSheet),
  { ssr: false },
);
const NewThesisModal = dynamic(() => import("../new-thesis-modal").then((m) => m.NewThesisModal), {
  ssr: false,
});
const ThesisPreviewSheet = dynamic(
  () => import("../thesis-preview-sheet").then((m) => m.ThesisPreviewSheet),
  { ssr: false },
);

function PortfolioModals({
  ui,
  ext,
}: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
}) {
  const compareMounted = useHasOpened(ext.compareOpen);
  const importMounted = useHasOpened(ext.importOpen);
  const stressMounted = useHasOpened(ext.stressOpen);
  return (
    <>
      {compareMounted ? (
        <CompareThesesSheet
          open={ext.compareOpen}
          theses={ext.compareTheses}
          onOpenChange={ext.setCompareOpen}
          onClearSelection={ext.clearCompare}
        />
      ) : null}
      {importMounted ? (
        <ImportArchiveModal
          open={ext.importOpen}
          onOpenChange={ext.setImportOpen}
          onImported={ext.onImported}
        />
      ) : null}
      {stressMounted ? (
        <PortfolioStressSheet
          open={ext.stressOpen}
          theses={ui.theses}
          onOpenChange={ext.setStressOpen}
          onInspectThesis={ui.setPreviewThesis}
        />
      ) : null}
    </>
  );
}

function CoreWorkspaceModals(p: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  market: LiveMarketQuotesState;
  currentUser: PublicUser;
  settingsTab?: SettingsTabId;
}) {
  const { ui, ext, market } = p;
  const previewMounted = useHasOpened(ui.previewThesis !== null);
  const createMounted = useHasOpened(ui.modals.create);
  const aiMounted = useHasOpened(ui.modals.ai);
  const onAiChanged = () => {
    ui.setHasByok(Boolean(readByokConfig()));
    void market.refresh(true);
  };
  return (
    <>
      {previewMounted ? (
        <ThesisPreviewSheet
          thesis={ui.previewThesis}
          liveQuote={ui.previewThesis ? market.quotes[ui.previewThesis.ticker] : undefined}
          onClose={() => ui.setPreviewThesis(null)}
          onUpdated={ui.replaceThesis}
        />
      ) : null}
      {createMounted ? (
        <NewThesisModal
          open={ui.modals.create}
          onOpenChange={(o) => ui.setModal("create", o)}
          onCreated={ext.onCreated}
        />
      ) : null}
      {aiMounted ? (
        <AiSettingsModal
          open={ui.modals.ai}
          initialTab={p.settingsTab}
          currentUser={p.currentUser}
          onOpenChange={(o) => ui.setModal("ai", o)}
          onChanged={onAiChanged}
          refreshingPrices={ext.refreshingPrices}
          onRefreshPrices={() => void ext.refreshPrices()}
          onOpenImport={() => ext.setImportOpen(true)}
        />
      ) : null}
    </>
  );
}

export function CockpitOverlays(props: {
  ui: ReturnType<typeof useCockpitState>;
  ext: ReturnType<typeof usePortfolioOverlayState>;
  market: LiveMarketQuotesState;
  currentUser: PublicUser;
  settingsTab?: SettingsTabId;
}) {
  return (
    <>
      <CommandMenu
        open={props.ui.modals.cmd}
        onOpenChange={(o) => props.ui.setModal("cmd", o)}
        groups={props.ui.commandGroups}
      />
      <CoreWorkspaceModals {...props} />
      <PortfolioModals ui={props.ui} ext={props.ext} />
    </>
  );
}
