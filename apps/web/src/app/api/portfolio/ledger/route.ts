import { LedgerPostRequestSchema, todayIsoUtc } from "@kanon/core";
import {
  createPortfolioAccount,
  getKanonDb,
  LedgerPolicyError,
  listPortfolioAccounts,
  listPortfolioPositions,
  listPortfolioTransactions,
  recordPortfolioTransaction,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

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

async function handleLedgerPost(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  userId: string,
  data: ReturnType<typeof LedgerPostRequestSchema.parse>,
  startedAt: number,
) {
  if (data.op === "create_account") {
    const account = await createPortfolioAccount(db, {
      userId,
      name: data.name,
      baseCurrency: data.baseCurrency,
      initialCash: data.initialCash,
      noLeverageConfirmed: data.noLeverageConfirmed,
    });
    return jsonOk({ account }, startedAt, 201);
  }
  try {
    const result = await recordPortfolioTransaction(db, {
      userId,
      accountId: data.accountId,
      thesisId: data.thesisId ?? null,
      ticker: data.ticker,
      action: data.action,
      quantity: data.quantity,
      price: data.price,
      fees: data.fees,
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
  const db = await getKanonDb();
  return handleLedgerPost(db, auth.user.id, parsed.data, startedAt);
}
