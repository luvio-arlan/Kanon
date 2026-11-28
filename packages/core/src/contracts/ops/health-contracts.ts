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
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function parseCronGraceHours(raw: string | undefined): number {
  if (!raw?.trim()) return 30;
  const parsed = z.coerce.number().finite().min(0).max(168).safeParse(raw.trim());
  return parsed.success ? parsed.data : 30;
}
