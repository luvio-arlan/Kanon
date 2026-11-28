import { NextResponse } from "next/server";
import { generateRequestId, logStructuredApiEvent } from "./logger";

interface ValidationIssueLike {
  path: readonly PropertyKey[];
  message: string;
}

const VALID_REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Validates inbound `x-request-id` (8–64 safe chars) or generates a fresh request id (U3-1). */
export function resolveRequestId(request?: Request): string {
  const raw = request?.headers.get("x-request-id")?.trim();
  if (raw && VALID_REQUEST_ID_RE.test(raw)) return raw;
  return generateRequestId();
}

export function apiHeaders(
  startedAt: number,
  requestId = generateRequestId(),
): Record<string, string> {
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    "Cache-Control": "no-store",
    "X-Kanon-Duration-Ms": String(durationMs),
    "X-Request-Id": requestId,
  };
}

export function jsonOk<T>(data: T, startedAt: number, status = 200, requestId?: string) {
  return NextResponse.json(data, { status, headers: apiHeaders(startedAt, requestId) });
}

export function jsonError(
  message: string,
  status: number,
  startedAt: number,
  code?: string,
  requestId = generateRequestId(),
) {
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  if (status >= 500) {
    logStructuredApiEvent({ level: "error", requestId, status, durationMs, code, message });
  }
  const body = code ? { error: message, code, requestId } : { error: message, requestId };
  return NextResponse.json(body, { status, headers: apiHeaders(startedAt, requestId) });
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
  // @kanon-validated: HTTP content-length header byte-limit guard
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
