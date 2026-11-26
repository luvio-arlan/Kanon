"use client";

import { Sheet } from "@kanon/ui";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiCreateLedgerAccount,
  apiLoadPortfolioLedger,
  apiRecordLedgerTx,
  type LedgerAccountRow,
} from "../../lib/inbox-ledger-api";
import { ResearchInboxSheet } from "./inbox-sheet";
import {
  EmptyLedgerState,
  LedgerPositionsList,
  LedgerTxForm,
  type LedgerTxPayload,
} from "./ledger-sheet-parts";

function PortfolioLedgerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [accounts, setAccounts] = useState<LedgerAccountRow[]>([]);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    if (open) void apiLoadPortfolioLedger().then(setAccounts);
  }, [open]);
  useEffect(() => reload(), [reload]);

  const active = accounts[0];
  const handleCreate = async (initialCash: number, confirmed: boolean) => {
    setBusy(true);
    const res = await apiCreateLedgerAccount("主投研账本", initialCash, confirmed);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("已创建账本");
    reload();
  };
  const handleTx = async (p: LedgerTxPayload) => {
    setBusy(true);
    const res = await apiRecordLedgerTx(p);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("已登记");
    reload();
  };
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="账本" size="md">
      {!active ? (
        <EmptyLedgerState busy={busy} onCreate={(c, ok) => void handleCreate(c, ok)} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-panel border border-hairline bg-canvas/50 px-4 py-3 text-xs">
            <span className="font-semibold text-ink-primary">{active.name}</span>
            <span className="font-mono text-sm font-semibold text-ink-primary tabular-nums">
              可用现金 ${active.cashBalance.toLocaleString()}
            </span>
          </div>
          <LedgerTxForm accountId={active.id} busy={busy} onSubmit={(p) => void handleTx(p)} />
          <LedgerPositionsList positions={active.positions} />
        </div>
      )}
    </Sheet>
  );
}

export function CockpitWorkflowSheets({
  inboxOpen,
  ledgerOpen,
  onCloseInbox,
  onCloseLedger,
}: {
  inboxOpen: boolean;
  ledgerOpen: boolean;
  onCloseInbox: () => void;
  onCloseLedger: () => void;
}) {
  return (
    <>
      <ResearchInboxSheet open={inboxOpen} onClose={onCloseInbox} />
      <PortfolioLedgerSheet open={ledgerOpen} onClose={onCloseLedger} />
    </>
  );
}
