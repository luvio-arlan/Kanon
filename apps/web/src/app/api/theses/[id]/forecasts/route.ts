import {
  calculateLogLoss,
  calculateMultiClassBrierScore,
  ForecastCreateRequestSchema,
  ForecastResolveRequestSchema,
} from "@kanon/core";
import {
  assertThesisAccess,
  createImmutableForecast,
  getKanonDb,
  listForecasts,
  resolveForecast,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  if (!(await assertThesisAccess(db, id, auth.user.id, "read"))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const forecasts = await listForecasts(db, auth.user.id, id);
  const resolved = forecasts
    .filter((f) => f.outcomeJson !== null)
    .map((f) => ({
      probabilities: f.probabilitiesJson,
      outcomeIndex: f.outcomeJson?.outcomeIndex ?? -1,
    }));
  return jsonOk(
    {
      forecasts,
      resolvedCount: resolved.length,
      brierScore: calculateMultiClassBrierScore(resolved),
      logLoss: calculateLogLoss(resolved),
    },
    startedAt,
  );
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  if (!(await assertThesisAccess(db, id, auth.user.id, "write"))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = ForecastCreateRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "请提供可证伪预测问题、未来到期日及合法概率分布。"),
      400,
      startedAt,
      "INVALID_FORECAST",
    );
  }
  try {
    const forecast = await createImmutableForecast(db, {
      userId: auth.user.id,
      thesisId: id,
      ...parsed.data,
    });
    return jsonOk({ forecast }, startedAt, 201);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "预测创建失败。",
      400,
      startedAt,
      "INVALID",
    );
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  if (!(await assertThesisAccess(db, id, auth.user.id, "write"))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = ForecastResolveRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "请提供有效 forecastId 与 outcomeIndex。"),
      400,
      startedAt,
      "INVALID",
    );
  }
  try {
    const ok = await resolveForecast(db, {
      userId: auth.user.id,
      thesisId: id,
      ...parsed.data,
    });
    if (!ok) {
      return jsonError("该预测不存在或已结算，不可重复结算。", 409, startedAt, "ALREADY_RESOLVED");
    }
    return jsonOk({ ok: true }, startedAt);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "结算失败。",
      400,
      startedAt,
      "INVALID_OUTCOME",
    );
  }
}
