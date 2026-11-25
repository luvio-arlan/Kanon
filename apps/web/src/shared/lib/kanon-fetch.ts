import { ApiErrorResponseSchema } from "@kanon/core";

export interface SafeParseSchema<T> {
  safeParse: (
    input: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { message: string }[] } };
}

export type KanonFetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number; code?: string };

export function parseValidatedJson<T>(
  raw: string,
  schema: SafeParseSchema<T>,
): { ok: true; data: T } | { ok: false; error: string } {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "JSON 解析失败" };
  }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "响应结构校验失败" };
  }
  return { ok: true, data: parsed.data };
}

export function parseValidatedSseLine<T>(line: string, schema: SafeParseSchema<T>): T | null {
  if (!line.startsWith("data: ")) return null;
  const parsed = parseValidatedJson(line.slice(6), schema);
  return parsed.ok ? parsed.data : null;
}

function buildFetchError<T>(
  rawJson: unknown,
  status: number,
  fallback: string,
): KanonFetchResult<T> {
  const errParsed = ApiErrorResponseSchema.safeParse(rawJson);
  return {
    ok: false,
    error: errParsed.success ? errParsed.data.error : fallback,
    status,
    code: errParsed.success ? errParsed.data.code : undefined,
  };
}

function createFetchTimeout(timeoutMs?: number) {
  if (!timeoutMs) return { controller: null, clear: () => undefined };
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(id) };
}

async function decodeFetchResponse<T>(
  res: Response,
  schema: SafeParseSchema<T>,
  fallback: string,
): Promise<KanonFetchResult<T>> {
  const rawJson: unknown = await res.json().catch(() => null);
  if (!res.ok) return buildFetchError(rawJson, res.status, fallback);
  const parsed = schema.safeParse(rawJson);
  if (!parsed.success) {
    return { ok: false, error: "服务端返回数据格式异常", status: res.status };
  }
  return { ok: true, data: parsed.data, status: res.status };
}

function resolveAbortSignal(
  timeoutSignal: AbortSignal | undefined,
  externalSignal: AbortSignal | undefined,
): AbortSignal | undefined {
  if (timeoutSignal && externalSignal) return AbortSignal.any([timeoutSignal, externalSignal]);
  return timeoutSignal ?? externalSignal;
}

export async function kanonFetch<T>(
  url: string,
  schema: SafeParseSchema<T>,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
    fallbackError?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<KanonFetchResult<T>> {
  const fallback = options?.fallbackError ?? "请求失败，请重试";
  const timeout = createFetchTimeout(options?.timeoutMs);
  try {
    const hasBody = options?.body !== undefined;
    const res = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...options?.headers,
      },
      body: hasBody ? JSON.stringify(options?.body) : undefined,
      signal: resolveAbortSignal(timeout.controller?.signal, options?.signal),
    });
    return await decodeFetchResponse(res, schema, fallback);
  } catch (err) {
    if (options?.signal?.aborted) {
      return { ok: false, error: "请求已取消", status: 0, code: "ABORTED" };
    }
    if (timeout.controller?.signal.aborted) {
      return { ok: false, error: "请求超时，请点击重试", status: 408 };
    }
    return { ok: false, error: err instanceof Error ? err.message : fallback, status: 0 };
  } finally {
    timeout.clear();
  }
}
