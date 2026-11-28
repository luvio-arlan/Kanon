"use client";

import type { PortfolioPerformanceResponse } from "@kanon/core";
import { Button, Sheet } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiCreateLedgerAccount,
  apiLoadPortfolioLedger,
  apiLoadPortfolioPerformance,
  apiRecordLedgerTx,
  type LedgerAccountRow,
} from "../../lib/inbox-ledger-api";
import { ResearchInboxSheet } from "./inbox-sheet";
import { LedgerPerformanceLine } from "./ledger-performance-line";
import {
  EmptyLedgerState,
  LedgerPositionsList,
  LedgerTxForm,
  type LedgerTxPayload,
} from "./ledger-sheet-parts";

function ActiveLedgerContent({
  active,
  perf,
  busy,
  txFormOpen,
  onToggleTxForm,
  onSubmitTx,
}: {
  active: LedgerAccountRow;
  perf: PortfolioPerformanceResponse | null;
  busy: boolean;
  txFormOpen: boolean;
  onToggleTxForm: () => void;
  onSubmitTx: (p: LedgerTxPayload) => void;
}) {
  const currency = active.baseCurrency ?? "USD";
  return (
    <div className="space-y-4">
      {active.ledgerInconsistent ? (
        <div className="rounded-control border border-hairline bg-canvas/60 px-3 py-2 text-xs text-status-warn">
          账户币种待迁移
        </div>
      ) : null}
      <LedgerPerformanceLine
        perf={perf}
        accountName={active.name}
        cashBalance={active.cashBalance}
        baseCurrency={currency}
      />
      <div className="flex justify-end">
        <Button variant="outline" size="xs" onClick={onToggleTxForm}>
          <IconPlus size={13} stroke={1.5} />
          <span>{txFormOpen ? "收起记账" : "登记成交"}</span>
        </Button>
      </div>
      {txFormOpen ? <LedgerTxForm accountId={active.id} busy={busy} onSubmit={onSubmitTx} /> : null}
      <LedgerPositionsList positions={active.positions} currency={currency} />
    </div>
  );
}

function useLedgerSheetData(open: boolean) {
  const [accounts, setAccounts] = useState<LedgerAccountRow[]>([]);
  const [perf, setPerf] = useState<PortfolioPerformanceResponse | null>(null);
  const reload = useCallback(() => {
    if (!open) return;
    void Promise.all([apiLoadPortfolioLedger(), apiLoadPortfolioPerformance()]).then(
      ([accts, perfData]) => {
        setAccounts(accts);
        setPerf(perfData);
      },
    );
  }, [open]);
  useEffect(() => reload(), [reload]);
  return { active: accounts[0], perf, reload };
}

function PortfolioLedgerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { active, perf, reload } = useLedgerSheetData(open);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
    setTxFormOpen(false);
    reload();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="账本" size="md">
      {!active ? (
        <EmptyLedgerState busy={busy} onCreate={(c, ok) => void handleCreate(c, ok)} />
      ) : (
        <ActiveLedgerContent
          active={active}
          perf={perf}
          busy={busy}
          txFormOpen={txFormOpen}
          onToggleTxForm={() => setTxFormOpen((v) => !v)}
          onSubmitTx={(p) => void handleTx(p)}
        />
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
