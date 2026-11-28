import { z } from "zod";

export const CronStateSchema = z.enum(["ok", "pending_first_run", "stale", "never_ran", "overrun"]);
export type CronState = z.infer<typeof CronStateSchema>;

export const HealthCronSchema = z.object({
  state: CronStateSchema,
  lastStartedAt: z.string().datetime().nullable(),
  lastCompletedAt: z.string().datetime().nullable(),
  lastClaimed: z.number().int().nonnegative().nullable(),
  lastFailed: z.number().int().nonnegative().nullable(),
  backlog: z.number().int().nonnegative(),
});
export type HealthCron = z.infer<typeof HealthCronSchema>;

export const HealthDbPostureSchema = z.object({
  bypassRls: z.boolean(),
  rlsFailClosed: z.boolean(),
});
export type HealthDbPosture = z.infer<typeof HealthDbPostureSchema>;

export const HealthFreshnessSchema = z.object({
  staleTickers: z.number().int().nonnegative(),
  superseded48h: z.number().int().nonnegative(),
});
export type HealthFreshness = z.infer<typeof HealthFreshnessSchema>;

const ID_SEGMENT_RE = /^(?=.*\d)[A-Za-z0-9_-]{6,}$|^[A-Za-z0-9_-]{24,}$/;

/**
 * Collapses identifier-like path segments (`/thesis/th_8f3a…` → `/thesis/[id]`) so telemetry stores route
 * templates, never per-record identifiers, and fingerprint cardinality stays bounded (V2-3).
 */
export function templateRoutePath(raw: string): string {
  const path = raw.split(/[?#]/)[0] ?? "/";
  const tpl = path
    .split("/")
    .map((seg) => (ID_SEGMENT_RE.test(seg) ? "[id]" : seg))
    .join("/");
  return tpl.slice(0, 120) || "/";
}

export const ClientErrorReportSchema = z.object({
  route: z.string().trim().min(1).max(120),
  digest: z.string().regex(/^[a-f0-9]{16,64}$/),
  kind: z.enum(["render", "fetch", "unhandled"]),
  buildId: z.string().max(40),
});
export type ClientErrorReport = z.infer<typeof ClientErrorReportSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded"]),
  timestamp: z.string().datetime(),
  secUserAgentConfigured: z.boolean(),
  secretsConfigured: z.object({
    credentials: z.boolean(),
    cron: z.boolean(),
    secUserAgent: z.boolean(),
  }),
  jobQueue: z.unknown(),
  cron: HealthCronSchema,
  db: HealthDbPostureSchema,
  dbSizePct: z.number().nullable(),
  errors24h: z.number().int().nonnegative().default(0),
  freshness: HealthFreshnessSchema.default({ staleTickers: 0, superseded48h: 0 }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function parseCronGraceHours(raw: string | undefined): number {
  if (!raw?.trim()) return 30;
  const parsed = z.coerce.number().finite().min(0).max(168).safeParse(raw.trim());
  return parsed.success ? parsed.data : 30;
}
