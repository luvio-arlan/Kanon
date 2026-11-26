import {
  createPortfolioAccount,
  getKanonDb,
  type LedgerAction,
  listPortfolioAccounts,
  listPortfolioPositions,
  listPortfolioTransactions,
  recordPortfolioTransaction,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set<LedgerAction>(["deposit", "withdraw", "buy", "sell", "dividend"]);

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function parseLedgerTransaction(rec: Record<string, unknown>) {
  const action = String(rec.action ?? "") as LedgerAction;
  if (!ALLOWED_ACTIONS.has(action) || typeof rec.accountId !== "string") return null;
  return {
    accountId: rec.accountId,
    thesisId: typeof rec.thesisId === "string" ? rec.thesisId : null,
    ticker: typeof rec.ticker === "string" ? rec.ticker : "CASH",
    action,
    quantity: Number(rec.quantity ?? 0),
    price: Number(rec.price ?? 0),
    fees: Number(rec.fees ?? 0),
    tradeDate:
      typeof rec.tradeDate === "string" ? rec.tradeDate : new Date().toISOString().slice(0, 10),
    noLeverageConfirmed: rec.noLeverageConfirmed === true,
    note: typeof rec.note === "string" ? rec.note : "",
  };
}

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const db = await getKanonDb();
  const accounts = await listPortfolioAccounts(db, auth.user.id);
  const detailed = await Promise.all(
    accounts.map(async (acct) => ({
      ...acct,
      positions: await listPortfolioPositions(db, acct.id),
      transactions: await listPortfolioTransactions(db, acct.id, 30),
    })),
  );
  return jsonOk({ accounts: detailed }, startedAt);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rec = asRecord(await request.json().catch(() => null));
  if (!rec) return jsonError("请求体格式无效。", 400, startedAt, "INVALID_LEDGER_OP");
  const db = await getKanonDb();

  if (rec.op === "create_account") {
    const account = await createPortfolioAccount(db, {
      userId: auth.user.id,
      name: typeof rec.name === "string" ? rec.name : "主投研账户",
      initialCash: typeof rec.initialCash === "number" ? rec.initialCash : 0,
    });
    return jsonOk({ account }, startedAt, 201);
  }

  const parsed = parseLedgerTransaction(rec);
  if (!parsed) return jsonError("无效的账户或成交操作。", 400, startedAt, "INVALID_LEDGER_OP");
  try {
    const result = await recordPortfolioTransaction(db, { userId: auth.user.id, ...parsed });
    return jsonOk({ result }, startedAt, 201);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "账本记录失败。",
      400,
      startedAt,
      "LEDGER_REJECTED",
    );
  }
}
