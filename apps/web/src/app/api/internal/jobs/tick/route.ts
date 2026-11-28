import crypto from "node:crypto";
import { jsonError, jsonOk } from "../../../_lib/http";
import { runCronTick } from "./tick-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronSecret(request: Request, startedAt: number): Response | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return jsonError("未配置 CRON_SECRET，后台任务通道已关闭。", 503, startedAt, "CRON_DISABLED");
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return jsonError("Cron 认证令牌无效。", 401, startedAt, "UNAUTHORIZED");
  }
  return null;
}

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const authErr = verifyCronSecret(request, startedAt);
  if (authErr) return authErr;
  const result = await runCronTick();
  return jsonOk(result, startedAt);
}
