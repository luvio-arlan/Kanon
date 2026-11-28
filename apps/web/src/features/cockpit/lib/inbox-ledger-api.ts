import {
  AlertRuleUpsertResponseSchema,
  CalendarRotateResponseSchema,
  type CurrencyCode,
  GenericOkResponseSchema,
  InboxLoadResponseSchema,
  LedgerAccountCreateResponseSchema,
  LedgerAccountListResponseSchema,
  LedgerTransactionCreateResponseSchema,
  type LedgerTransactionRow,
  type PortfolioPerformanceResponse,
  PortfolioPerformanceResponseSchema,
} from "@kanon/core";
import { z } from "zod";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export interface InboxItemRow {
  id: string;
  thesisId?: string | null;
  severity: "critical" | "warn" | "info";
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface AlertRuleRow {
  id: string;
  thesisId?: string | null;
  kind: "price_hurdle" | "pe_band_breach" | "forecast_due" | "form8k_redflag";
  configJson?: Record<string, unknown>;
  enabled: boolean;
}

export type LedgerAccountRow = z.infer<typeof LedgerAccountListResponseSchema>["accounts"][number];

export type LedgerMutationResult = { ok: true } | { ok: false; error: string; code?: string };

const LedgerMutationAckSchema = z.object({ result: z.unknown() });

export async function apiLoadInbox() {
  const res = await kanonFetch("/api/inbox", InboxLoadResponseSchema);
  if (!res.ok) {
    return { items: [] as InboxItemRow[], rules: [] as AlertRuleRow[], calendarConfigured: false };
  }
  return {
    items: res.data.items,
    rules: res.data.rules ?? [],
    calendarConfigured: Boolean(res.data.calendarConfigured),
  };
}

export async function apiUpsertAlertRule(input: {
  id?: string;
  thesisId?: string | null;
  kind: AlertRuleRow["kind"];
  configJson?: Record<string, unknown>;
  enabled?: boolean;
}): Promise<boolean> {
  const res = await kanonFetch("/api/inbox", AlertRuleUpsertResponseSchema, {
    method: "POST",
    body: { op: "upsert_rule", ...input },
  });
  return res.ok;
}

export async function apiRotateCalendarToken(): Promise<string | null> {
  const res = await kanonFetch("/api/inbox", CalendarRotateResponseSchema, {
    method: "POST",
    body: { op: "rotate_calendar" },
  });
  return res.ok ? res.data.calendarToken : null;
}

export async function apiMarkInboxRead(itemId: string): Promise<void> {
  await kanonFetch("/api/inbox", GenericOkResponseSchema, {
    method: "PATCH",
    body: { itemId },
  });
}

export async function apiMarkAllInboxRead(): Promise<void> {
  await kanonFetch("/api/inbox", GenericOkResponseSchema, {
    method: "PATCH",
    body: { markAll: true },
  });
}

export async function apiLoadPortfolioLedger(): Promise<LedgerAccountRow[]> {
  const res = await kanonFetch("/api/portfolio/ledger", LedgerAccountListResponseSchema);
  return res.ok ? res.data.accounts : [];
}

export async function apiCreateLedgerAccount(
  name: string,
  initialCash: number,
  noLeverageConfirmed: boolean,
  baseCurrency: CurrencyCode,
): Promise<LedgerMutationResult> {
  const res = await kanonFetch("/api/portfolio/ledger", LedgerAccountCreateResponseSchema, {
    method: "POST",
    body: { op: "create_account", name, initialCash, noLeverageConfirmed, baseCurrency },
    fallbackError: "创建账本失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiLoadPortfolioPerformance(
  accountId?: string,
): Promise<PortfolioPerformanceResponse | null> {
  const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  const res = await kanonFetch(
    `/api/portfolio/performance${qs}`,
    PortfolioPerformanceResponseSchema,
  );
  return res.ok ? res.data : null;
}

export interface LedgerTxInput {
  accountId: string;
  ticker: string;
  action: LedgerTransactionRow["action"];
  quantity: number;
  price: number;
  fees: number;
  tradeDate: string;
  thesisId: string | null;
  fxToBase?: number;
  fxDeviationAck?: boolean;
}

export async function apiRecordLedgerTx(input: LedgerTxInput): Promise<LedgerMutationResult> {
  const res = await kanonFetch("/api/portfolio/ledger", LedgerTransactionCreateResponseSchema, {
    method: "POST",
    body: { op: "record_transaction", ...input },
    fallbackError: "记账被风控拦截",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error, code: res.code };
}

export async function apiReverseLedgerTx(
  accountId: string,
  transactionId: string,
): Promise<LedgerMutationResult> {
  const res = await kanonFetch("/api/portfolio/ledger", LedgerMutationAckSchema, {
    method: "POST",
    body: { op: "reverse_transaction", accountId, transactionId },
    fallbackError: "冲销失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error, code: res.code };
}

export async function apiConfirmLegacyCurrency(
  accountId: string,
  mode: "as_base" | "infer_by_ticker",
): Promise<LedgerMutationResult> {
  const res = await kanonFetch("/api/portfolio/ledger", LedgerMutationAckSchema, {
    method: "POST",
    body: { op: "confirm_legacy_currency", accountId, mode },
    fallbackError: "币种确认失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error, code: res.code };
}
