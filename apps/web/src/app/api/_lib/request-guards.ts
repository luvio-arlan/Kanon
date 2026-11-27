import { consumePersistentRateLimit, getKanonDb, type KanonDb } from "@kanon/core/db";
import type { NextResponse } from "next/server";
import { jsonError } from "./http";

interface RateBucketState {
  count: number;
  resetAt: number;
}

export interface RateLimitPolicy {
  bucket: string;
  maxRequests: number;
  windowMs: number;
}

declare global {
  var __kanonRateBuckets: Map<string, RateBucketState> | undefined;
}

function getRateStore(): Map<string, RateBucketState> {
  if (!globalThis.__kanonRateBuckets) {
    globalThis.__kanonRateBuckets = new Map();
  }
  return globalThis.__kanonRateBuckets;
}

const SAFE_IP_RE = /^[a-fA-F0-9:.]{2,45}$/;

function sanitizeIp(raw: string | null): string | null {
  const candidate = raw?.split(",")[0]?.trim() ?? "";
  return SAFE_IP_RE.test(candidate) ? candidate : null;
}

function isTrustedProxyEnv(): boolean {
  return process.env.VERCEL === "1" || process.env.KANON_TRUST_PROXY === "1";
}

export function extractClientIp(request: Request): string {
  if (isTrustedProxyEnv()) {
    return (
      sanitizeIp(request.headers.get("x-vercel-forwarded-for")) ??
      sanitizeIp(request.headers.get("x-real-ip")) ??
      sanitizeIp(request.headers.get("x-forwarded-for")) ??
      "local"
    );
  }
  return sanitizeIp(request.headers.get("x-real-ip")) ?? "local";
}

function pruneExpiredBuckets(store: Map<string, RateBucketState>, now: number): void {
  if (store.size < 500) return;
  for (const [key, state] of store.entries()) {
    if (state.resetAt <= now) store.delete(key);
  }
}

export function checkRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  startedAt: number,
  extraKey?: string,
): NextResponse | null {
  const now = Date.now();
  const store = getRateStore();
  pruneExpiredBuckets(store, now);

  const ip = extractClientIp(request);
  const key = extraKey ? `${policy.bucket}:${ip}:${extraKey}` : `${policy.bucket}:${ip}`;
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + policy.windowMs });
    return null;
  }
  if (existing.count >= policy.maxRequests) {
    const retrySec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    const res = jsonError(
      `请求过于频繁，请 ${retrySec} 秒后再试。`,
      429,
      startedAt,
      "RATE_LIMITED",
    );
    res.headers.set("Retry-After", String(retrySec));
    return res;
  }
  existing.count += 1;
  return null;
}

export async function checkPersistentRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  startedAt: number,
  extraKey?: string,
): Promise<NextResponse | null> {
  const ip = extractClientIp(request);
  const bucketKey = extraKey ? `${policy.bucket}:${ip}:${extraKey}` : `${policy.bucket}:${ip}`;
  try {
    const db = await getKanonDb();
    const res = await consumePersistentRateLimit(db, {
      bucketKey,
      maxRequests: policy.maxRequests,
      windowMs: policy.windowMs,
    });
    if (res.allowed) return null;
    const response = jsonError(
      `请求过于频繁，请 ${res.retryAfterSec} 秒后再试。`,
      429,
      startedAt,
      "RATE_LIMITED",
    );
    response.headers.set("Retry-After", String(res.retryAfterSec));
    return response;
  } catch (err) {
    void err;
    return checkRateLimit(request, policy, startedAt, extraKey);
  }
}

function matchesRequestHost(request: Request): boolean {
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const host = rawHost.split(",")[0]?.trim() ?? "";
  const candidate = request.headers.get("origin")?.trim() || request.headers.get("referer")?.trim();
  if (!candidate || !host) return true;
  try {
    return new URL(candidate).host.toLowerCase() === host.toLowerCase();
  } catch (err) {
    void err;
    return false;
  }
}

export function verifySameOrigin(
  request: Request,
  startedAt: number,
  options?: { allowBearerBypass?: boolean },
): NextResponse | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite === "cross-site") {
    return jsonError(
      "跨站请求来源校验未通过，请刷新页面后重试。",
      403,
      startedAt,
      "ORIGIN_MISMATCH",
    );
  }
  const hasBearer = /^bearer\s+\S/i.test(request.headers.get("authorization")?.trim() ?? "");
  if (options?.allowBearerBypass && hasBearer) return null;
  if (matchesRequestHost(request)) return null;
  return jsonError("跨站请求来源校验未通过，请刷新页面后重试。", 403, startedAt, "ORIGIN_MISMATCH");
}

function waitMsWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Distributed SEC fair-access token bucket (<= 8 req/s across all serverless instances). */
export async function acquireSecGlobalSlot(
  signal?: AbortSignal,
  dbOverride?: KanonDb,
  maxPerSec = 8,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
    const epochSec = Math.floor(Date.now() / 1000);
    try {
      const db = dbOverride ?? (await getKanonDb());
      const res = await consumePersistentRateLimit(db, {
        bucketKey: `sec:global:${epochSec}`,
        maxRequests: maxPerSec,
        windowMs: 1000,
      });
      if (res.allowed) return;
    } catch (err) {
      void err;
      return;
    }
    const waitMs = Math.max(25, 1000 - (Date.now() % 1000) + 15);
    await waitMsWithSignal(waitMs, signal);
  }
}
