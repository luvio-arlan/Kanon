import { lt, sql } from "drizzle-orm";
import type { KanonDb } from "../../client";
import { rateLimitBucketsTable } from "../../schema";

export interface RateLimitCheckResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
}

export async function consumePersistentRateLimit(
  db: KanonDb,
  params: {
    bucketKey: string;
    maxRequests: number;
    windowMs: number;
    now?: Date;
  },
): Promise<RateLimitCheckResult> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const nextResetIso = new Date(now.getTime() + params.windowMs).toISOString();

  const result = await db.execute(sql`
    INSERT INTO rate_limit_buckets (bucket_key, count, reset_at)
    VALUES (${params.bucketKey}, 1, ${nextResetIso}::timestamptz)
    ON CONFLICT (bucket_key) DO UPDATE SET
      count = CASE
        WHEN rate_limit_buckets.reset_at <= ${nowIso}::timestamptz THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      reset_at = CASE
        WHEN rate_limit_buckets.reset_at <= ${nowIso}::timestamptz THEN ${nextResetIso}::timestamptz
        ELSE rate_limit_buckets.reset_at
      END
    RETURNING count, reset_at
  `);

  const rows = Array.isArray(result) ? result : result.rows;
  const row = rows[0] as { count?: unknown; reset_at?: unknown } | undefined;
  const count = Number(row?.count ?? 1);
  const resetAtMs = row?.reset_at ? new Date(String(row.reset_at)).getTime() : now.getTime();
  const retryAfterSec = Math.max(1, Math.ceil((resetAtMs - now.getTime()) / 1000));

  if (Math.random() < 0.02) {
    await db
      .delete(rateLimitBucketsTable)
      .where(lt(rateLimitBucketsTable.resetAt, now))
      .catch((err) => {
        void err;
      });
  }

  return {
    allowed: count <= params.maxRequests,
    count,
    retryAfterSec,
  };
}
