import { consumePersistentRateLimit, getKanonDb } from "@kanon/core/db";
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

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "local";
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

export function verifySameOrigin(request: Request, startedAt: number): NextResponse | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return null;

  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite === "cross-site") {
    return jsonError(
      "跨站请求来源校验未通过，请刷新页面后重试。",
      403,
      startedAt,
      "ORIGIN_MISMATCH",
    );
  }

  const host = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  ).trim();
  const origin = request.headers.get("origin")?.trim();
  const referer = request.headers.get("referer")?.trim();
  const candidate = origin || referer;
  if (!candidate || !host) return null;

  try {
    const parsedOrigin = new URL(candidate);
    if (parsedOrigin.host.toLowerCase() === host.toLowerCase()) {
      return null;
    }
  } catch (err) {
    void err;
  }
  return jsonError("跨站请求来源校验未通过，请刷新页面后重试。", 403, startedAt, "ORIGIN_MISMATCH");
}
