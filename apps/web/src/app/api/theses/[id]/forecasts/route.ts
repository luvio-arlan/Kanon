import { calculateLogLoss, calculateMultiClassBrierScore } from "@kanon/core";
import {
  assertThesisOwnership,
  createImmutableForecast,
  getKanonDb,
  listForecasts,
  resolveForecast,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { jsonError, jsonOk } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

function parseForecastBody(bodyUnknown: unknown) {
  if (!bodyUnknown || typeof bodyUnknown !== "object") return null;
  const raw = bodyUnknown as Record<string, unknown>;
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  const resolveBy = typeof raw.resolveBy === "string" ? raw.resolveBy.trim() : "";
  const probabilities = Array.isArray(raw.probabilities)
    ? raw.probabilities.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    : [];
  if (!question || !resolveBy || probabilities.length < 2) return null;
  return { question, resolveBy, probabilities };
}

function parseResolveBody(bodyUnknown: unknown) {
  if (!bodyUnknown || typeof bodyUnknown !== "object") return null;
  const raw = bodyUnknown as Record<string, unknown>;
  const forecastId = typeof raw.forecastId === "string" ? raw.forecastId.trim() : "";
  const outcomeIndex = typeof raw.outcomeIndex === "number" ? Math.round(raw.outcomeIndex) : -1;
  if (!forecastId || outcomeIndex < 0) return null;
  return { forecastId, outcomeIndex, note: typeof raw.note === "string" ? raw.note : undefined };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  if (!(await assertThesisOwnership(db, id, auth.user.id))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const forecasts = await listForecasts(db, auth.user.id, id);
  const resolved = forecasts
    .filter((f) => f.outcomeJson !== null)
    .map((f) => ({
      probabilities: f.probabilitiesJson,
      outcomeIndex: f.outcomeJson?.outcomeIndex ?? 0,
    }));
  return jsonOk(
    {
      forecasts,
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
  if (!(await assertThesisOwnership(db, id, auth.user.id))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const parsed = parseForecastBody(await request.json().catch(() => null));
  if (!parsed) {
    return jsonError(
      "请提供可证伪预测问题、到期日期及概率分布。",
      400,
      startedAt,
      "INVALID_FORECAST",
    );
  }
  try {
    const forecast = await createImmutableForecast(db, {
      userId: auth.user.id,
      thesisId: id,
      ...parsed,
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
  if (!(await assertThesisOwnership(db, id, auth.user.id))) {
    return jsonError("标的研究不存在或无访问权限。", 404, startedAt, "NOT_FOUND");
  }
  const parsed = parseResolveBody(await request.json().catch(() => null));
  if (!parsed) {
    return jsonError("请提供有效 forecastId 与 outcomeIndex。", 400, startedAt, "INVALID");
  }
  const ok = await resolveForecast(db, { userId: auth.user.id, ...parsed });
  return jsonOk({ ok }, startedAt);
}
