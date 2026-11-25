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

const DEFAULT_MAX_JSON_BYTES = 256 * 1024;

export async function readJsonBody(
  request: Request,
  startedAt: number,
  maxBytes: number = DEFAULT_MAX_JSON_BYTES,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase();
  if (contentType && !contentType.includes("application/json") && !contentType.includes("+json")) {
    return {
      ok: false,
      response: jsonError(
        "请求须使用 application/json 格式。",
        415,
        startedAt,
        "UNSUPPORTED_MEDIA",
      ),
    };
  }
  const declaredLen = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    return {
      ok: false,
      response: jsonError("请求体体积超出安全上限。", 413, startedAt, "PAYLOAD_TOO_LARGE"),
    };
  }
  try {
    const rawText = await request.text();
    if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
      return {
        ok: false,
        response: jsonError("请求体体积超出安全上限。", 413, startedAt, "PAYLOAD_TOO_LARGE"),
      };
    }
    const parsed: unknown = JSON.parse(rawText);
    return { ok: true, data: parsed };
  } catch (err) {
    void err;
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
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const record = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (record.code === "23505") return true;
    if (typeof record.message === "string") {
      const msg = record.message.toLowerCase();
      if (msg.includes("unique") || msg.includes("duplicate key")) return true;
    }
    current = record.cause;
  }
  return false;
}
