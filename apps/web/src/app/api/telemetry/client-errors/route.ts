import { ClientErrorReportSchema } from "@kanon/core";
import { recordAppErrorEvent } from "@kanon/core/db";
import { withSystemDb } from "../../_lib/db-context";
import { formatZodError, jsonError, jsonOk, readJsonBody, resolveRequestId } from "../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const CLIENT_ERROR_RATE_POLICY = {
  bucket: "telemetry_client_errors",
  maxRequests: 30,
  windowMs: 60 * 1000,
};

export async function POST(request: Request) {
  const startedAt = performance.now();
  const requestId = resolveRequestId(request);
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, CLIENT_ERROR_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const body = await readJsonBody(request, startedAt, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = ClientErrorReportSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "客户端错误上报参数不合法。"),
      400,
      startedAt,
      "INVALID",
      requestId,
    );
  }
  const { route, digest, kind, buildId } = parsed.data;
  await withSystemDb(
    "telemetry",
    (tx) =>
      recordAppErrorEvent(tx, {
        source: "client",
        route,
        code: `${kind}:${buildId || "unknown"}`,
        message: digest,
        requestId,
      }),
    requestId,
  );
  return jsonOk({ accepted: true, requestId }, startedAt, 202, requestId);
}
