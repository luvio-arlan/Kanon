export interface InboxItemRow {
  id: string;
  severity: "critical" | "warn" | "info";
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface LedgerAccountRow {
  id: string;
  name: string;
  cashBalance: number;
  positions: Array<{ ticker: string; shares: number; avgCostBasis: number; totalCost: number }>;
}

export async function apiLoadInbox() {
  const res = await fetch("/api/inbox").catch(() => null);
  if (!res?.ok) return { items: [] as InboxItemRow[], calendarToken: "" };
  const raw: unknown = await res.json().catch(() => null);
  if (!raw || typeof raw !== "object") return { items: [] as InboxItemRow[], calendarToken: "" };
  const rec = raw as { items?: InboxItemRow[]; calendarToken?: string };
  return { items: rec.items ?? [], calendarToken: rec.calendarToken ?? "" };
}

export async function apiMarkInboxRead(itemId: string): Promise<void> {
  await fetch("/api/inbox", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  }).catch(() => undefined);
}

export async function apiLoadPortfolioLedger(): Promise<LedgerAccountRow[]> {
  const res = await fetch("/api/portfolio/ledger").catch(() => null);
  if (!res?.ok) return [];
  const raw: unknown = await res.json().catch(() => null);
  if (raw && typeof raw === "object" && Array.isArray((raw as { accounts?: unknown }).accounts)) {
    return (raw as { accounts: LedgerAccountRow[] }).accounts;
  }
  return [];
}

export async function apiCreateLedgerAccount(name: string, initialCash: number): Promise<boolean> {
  const res = await fetch("/api/portfolio/ledger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create_account", name, initialCash }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function apiRecordLedgerTx(input: {
  accountId: string;
  ticker: string;
  action: "deposit" | "buy" | "sell";
  quantity: number;
  price: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/portfolio/ledger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "record_transaction", ...input, noLeverageConfirmed: true }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "网络请求失败" };
  if (res.ok) return { ok: true };
  const raw: unknown = await res.json().catch(() => null);
  const error =
    raw && typeof raw === "object" && typeof (raw as { error?: unknown }).error === "string"
      ? (raw as { error: string }).error
      : "记账被零杠杆风控拦截";
  return { ok: false, error };
}
