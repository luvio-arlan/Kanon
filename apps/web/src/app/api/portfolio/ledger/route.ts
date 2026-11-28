import { LedgerPostRequestSchema, todayIsoUtc } from "@kanon/core";
import {
  createPortfolioAccount,
  getOrgMemberRole,
  type KanonDb,
  LedgerPolicyError,
  listPortfolioAccounts,
  listPortfolioPositions,
  listPortfolioTransactions,
  recordPortfolioTransaction,
  reversePortfolioTransaction,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const detailed = await auth.withDb(async (tx) => {
    const accounts = await listPortfolioAccounts(tx, auth.user.id);
    return Promise.all(
      accounts.map(async (acct) => ({
        ...acct,
        positions: await listPortfolioPositions(tx, acct.id),
        transactions: await listPortfolioTransactions(tx, acct.id, 30),
      })),
    );
  });
  return jsonOk({ accounts: detailed }, startedAt);
}

async function handleCreateAccount(
  db: KanonDb,
  userId: string,
  data: Extract<ReturnType<typeof LedgerPostRequestSchema.parse>, { op: "create_account" }>,
  startedAt: number,
) {
  if (data.orgId) {
    const role = await getOrgMemberRole(db, data.orgId, userId);
    if (!role) return jsonError("权限不足：非该组织成员。", 403, startedAt, "FORBIDDEN");
  }
  const account = await createPortfolioAccount(db, {
    userId,
    orgId: data.orgId ?? null,
    name: data.name,
    baseCurrency: data.baseCurrency,
    initialCash: data.initialCash,
    noLeverageConfirmed: data.noLeverageConfirmed,
  });
  return jsonOk({ account }, startedAt, 201);
}

async function handleLedgerPost(
  db: KanonDb,
  userId: string,
  data: ReturnType<typeof LedgerPostRequestSchema.parse>,
  startedAt: number,
) {
  if (data.op === "create_account") return handleCreateAccount(db, userId, data, startedAt);
  try {
    if (data.op === "reverse_transaction") {
      const result = await reversePortfolioTransaction(db, {
        userId,
        accountId: data.accountId,
        transactionId: data.transactionId,
        note: data.note,
      });
      return jsonOk({ result }, startedAt, 201);
    }
    const result = await recordPortfolioTransaction(db, {
      userId,
      accountId: data.accountId,
      thesisId: data.thesisId ?? null,
      ticker: data.ticker,
      action: data.action,
      quantity: data.quantity,
      price: data.price,
      fees: data.fees,
      tradeCurrency: data.tradeCurrency,
      fxToBase: data.fxToBase,
      tradeDate: data.tradeDate ?? todayIsoUtc(),
      noLeverageConfirmed: data.noLeverageConfirmed,
      note: data.note,
      externalRef: data.externalRef,
    });
    return jsonOk({ result }, startedAt, 201);
  } catch (err) {
    if (err instanceof LedgerPolicyError) {
      return jsonError(err.message, err.status, startedAt, err.code);
    }
    return jsonError(
      err instanceof Error ? err.message : "账本记录失败。",
      400,
      startedAt,
      "LEDGER_REJECTED",
    );
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = LedgerPostRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "无效的账户或成交参数。"),
      400,
      startedAt,
      "INVALID_LEDGER_OP",
    );
  }
  return auth.withDb((tx) => handleLedgerPost(tx, auth.user.id, parsed.data, startedAt));
}
