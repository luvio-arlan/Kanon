import { NextResponse } from "next/server";

interface ValidationIssueLike {
  path: readonly PropertyKey[];
  message: string;
}

export function apiHeaders(startedAt: number): Record<string, string> {
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    "Cache-Control": "no-store",
    "X-Kanon-Duration-Ms": String(durationMs),
  };
}

export function jsonOk<T>(data: T, startedAt: number, status = 200) {
  return NextResponse.json(data, { status, headers: apiHeaders(startedAt) });
}

export function jsonError(message: string, status: number, startedAt: number, code?: string) {
  return NextResponse.json(code ? { error: message, code } : { error: message }, {
    status,
    headers: apiHeaders(startedAt),
  });
}

export async function readJsonBody(
  request: Request,
  startedAt: number,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return { ok: false, response: jsonError("请求体不是合法 JSON。", 400, startedAt, "BAD_JSON") };
  }
}

export function formatZodError(
  error: { issues: readonly ValidationIssueLike[] },
  fallback: string,
): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  const field = issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : "";
  return `${field}${issue.message}`;
}

export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as { code?: unknown; message?: unknown };
  if (record.code === "23505") return true;
  return typeof record.message === "string" && record.message.toLowerCase().includes("unique");
}
