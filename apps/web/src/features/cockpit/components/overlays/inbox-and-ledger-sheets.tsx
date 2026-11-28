"use client";

import type { CurrencyCode, PortfolioPerformanceResponse } from "@kanon/core";
import { Button, Sheet } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiConfirmLegacyCurrency,
  apiCreateLedgerAccount,
  apiLoadPortfolioLedger,
  apiLoadPortfolioPerformance,
  apiRecordLedgerTx,
  apiReverseLedgerTx,
  type LedgerAccountRow,
  type LedgerMutationResult,
  type LedgerTxInput,
} from "../../lib/inbox-ledger-api";
import { ResearchInboxSheet } from "./inbox-sheet";
import { LedgerPerformanceLine } from "./ledger-performance-line";
import { EmptyLedgerState, LedgerPositionsList } from "./ledger-sheet-parts";
import { type LedgerThesisRef, LedgerTxForm } from "./ledger-tx-form";
import { LedgerTxHistory } from "./ledger-tx-history";

interface LedgerActions {
  busy: boolean;
  record: (p: LedgerTxInput) => Promise<LedgerMutationResult>;
  reverse: (transactionId: string) => void;
  confirmCurrency: (mode: "as_base" | "infer_by_ticker") => void;
}

function CurrencyConfirmBar({ actions }: { actions: LedgerActions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline bg-canvas/60 px-3 py-2 text-xs">
      <span className="text-status-warn">账户币种待确认</span>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="xs"
          loading={actions.busy}
          onClick={() => actions.confirmCurrency("as_base")}
        >
          <span>按账户币种</span>
        </Button>
        <Button
          variant="outline"
          size="xs"
          loading={actions.busy}
          onClick={() => actions.confirmCurrency("infer_by_ticker")}
        >
          <span>按代码推断</span>
        </Button>
      </div>
    </div>
  );
}

function LedgerTxPanel({
  active,
  theses,
  actions,
}: {
  active: LedgerAccountRow;
  theses: readonly LedgerThesisRef[];
  actions: LedgerActions;
}) {
  const [open, setOpen] = useState(false);
  const record = async (p: LedgerTxInput) => {
    const res = await actions.record(p);
    if (res.ok) setOpen(false);
    return res;
  };
  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" size="xs" onClick={() => setOpen((v) => !v)}>
          <IconPlus size={13} stroke={1.5} />
          <span>{open ? "收起记账" : "登记成交"}</span>
        </Button>
      </div>
      {open ? (
        <LedgerTxForm
          accountId={active.id}
          baseCurrency={active.baseCurrency}
          theses={theses}
          busy={actions.busy}
          onSubmit={record}
        />
      ) : null}
    </>
  );
}

function ActiveLedgerContent({
  active,
  perf,
  theses,
  actions,
}: {
  active: LedgerAccountRow;
  perf: PortfolioPerformanceResponse | null;
  theses: readonly LedgerThesisRef[];
  actions: LedgerActions;
}) {
  const currency = active.baseCurrency;
  const positions = <LedgerPositionsList positions={active.positions} currency={currency} />;
  if (active.ledgerInconsistent) {
    return (
      <div className="space-y-4">
        <CurrencyConfirmBar actions={actions} />
        {positions}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <LedgerPerformanceLine
        perf={perf}
        accountName={active.name}
        cashBalance={active.cashBalance}
        baseCurrency={currency}
      />
      <LedgerTxPanel active={active} theses={theses} actions={actions} />
      {positions}
      <LedgerTxHistory
        transactions={active.transactions}
        baseCurrency={currency}
        busy={actions.busy}
        onReverse={actions.reverse}
      />
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

function useLedgerActions(active: LedgerAccountRow | undefined, reload: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<LedgerMutationResult>, success: string) => {
    setBusy(true);
    const res = await task();
    setBusy(false);
    if (res.ok) {
      toast.success(success);
      reload();
    }
    return res;
  };
  const actions: LedgerActions = {
    busy,
    record: (p) => run(() => apiRecordLedgerTx(p), "已登记"),
    reverse: (id) => {
      if (!active) return;
      void run(() => apiReverseLedgerTx(active.id, id), "已冲销").then(
        (r) => !r.ok && toast.error(r.error),
      );
    },
    confirmCurrency: (mode) => {
      if (!active) return;
      void run(() => apiConfirmLegacyCurrency(active.id, mode), "币种已确认").then(
        (r) => !r.ok && toast.error(r.error),
      );
    },
  };
  const create = (initialCash: number, confirmed: boolean, baseCurrency: CurrencyCode) => {
    void run(
      () => apiCreateLedgerAccount("主投研账本", initialCash, confirmed, baseCurrency),
      "已创建账本",
    ).then((r) => !r.ok && toast.error(r.error));
  };
  return { actions, create };
}

function PortfolioLedgerSheet({
  open,
  theses,
  onClose,
}: {
  open: boolean;
  theses: readonly LedgerThesisRef[];
  onClose: () => void;
}) {
  const { active, perf, reload } = useLedgerSheetData(open);
  const { actions, create } = useLedgerActions(active, reload);
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="账本" size="md">
      {!active ? (
        <EmptyLedgerState busy={actions.busy} onCreate={create} />
      ) : (
        <ActiveLedgerContent active={active} perf={perf} theses={theses} actions={actions} />
      )}
    </Sheet>
  );
}

export function CockpitWorkflowSheets({
  inboxOpen,
  ledgerOpen,
  theses,
  onCloseInbox,
  onCloseLedger,
}: {
  inboxOpen: boolean;
  ledgerOpen: boolean;
  theses: readonly LedgerThesisRef[];
  onCloseInbox: () => void;
  onCloseLedger: () => void;
}) {
  return (
    <>
      <ResearchInboxSheet open={inboxOpen} onClose={onCloseInbox} />
      <PortfolioLedgerSheet open={ledgerOpen} theses={theses} onClose={onCloseLedger} />
    </>
  );
}
