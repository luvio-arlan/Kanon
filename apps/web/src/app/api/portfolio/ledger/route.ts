import { ECB_FX_CURRENCIES } from "@kanon/ai";
import { LedgerPostRequestSchema, todayIsoUtc } from "@kanon/core";
import {
  confirmLegacyAccountCurrency,
  createPortfolioAccount,
  findEarliestAccountTradeDate,
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
import { ensureFxCoverage } from "../fx-coverage";

export const dynamic = "force-dynamic";

type LedgerPostRequest = ReturnType<typeof LedgerPostRequestSchema.parse>;

/** Earliest date whose ECB rates this mutation may need, so coverage is ensured before the tenant tx. */
async function fxCoverageFromDate(
  data: LedgerPostRequest,
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>,
  userId: string,
): Promise<string | null> {
  if (data.op === "create_account") return data.baseCurrency === "USD" ? null : todayIsoUtc();
  if (data.op === "reverse_transaction") return null;
  if (data.op === "confirm_legacy_currency") {
    return withDb((tx) => findEarliestAccountTradeDate(tx, { accountId: data.accountId, userId }));
  }
  return data.tradeDate ?? todayIsoUtc();
}

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
  data: Extract<LedgerPostRequest, { op: "create_account" }>,
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

/** Executes one non-create ledger mutation; returns the response payload and HTTP status. */
async function runLedgerMutation(
  db: KanonDb,
  userId: string,
  data: Exclude<LedgerPostRequest, { op: "create_account" }>,
): Promise<{ result: unknown; status: number }> {
  if (data.op === "confirm_legacy_currency") {
    const result = await confirmLegacyAccountCurrency(db, {
      userId,
      accountId: data.accountId,
      mode: data.mode,
    });
    return { result, status: 200 };
  }
  if (data.op === "reverse_transaction") {
    const result = await reversePortfolioTransaction(db, {
      userId,
      accountId: data.accountId,
      transactionId: data.transactionId,
      note: data.note,
    });
    return { result, status: 201 };
  }
  const { op: _op, tradeDate, thesisId, ...fields } = data;
  const result = await recordPortfolioTransaction(db, {
    ...fields,
    userId,
    thesisId: thesisId ?? null,
    tradeDate: tradeDate ?? todayIsoUtc(),
  });
  return { result, status: 201 };
}

async function handleLedgerPost(
  db: KanonDb,
  userId: string,
  data: LedgerPostRequest,
  startedAt: number,
) {
  if (data.op === "create_account") return handleCreateAccount(db, userId, data, startedAt);
  try {
    const { result, status } = await runLedgerMutation(db, userId, data);
    return jsonOk({ result }, startedAt, status);
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
  const fxFrom = await fxCoverageFromDate(parsed.data, auth.withDb, auth.user.id);
  if (fxFrom) await ensureFxCoverage(ECB_FX_CURRENCIES, fxFrom, "/api/portfolio/ledger");
  return auth.withDb((tx) => handleLedgerPost(tx, auth.user.id, parsed.data, startedAt));
}
