import { ThesisDetailSchema } from "@kanon/core";
import type { APIResponse } from "@playwright/test";
import { z } from "zod";

export const AuthUserResponseSchema = z.object({ user: z.object({ id: z.string() }) });
export const CreateThesisResponseSchema = z.object({ thesis: ThesisDetailSchema });
export const ErrorCodeResponseSchema = z.object({ code: z.string() });
export const InboxListResponseSchema = z.object({ items: z.array(z.object({ kind: z.string() })) });
export const ForecastCreateResponseSchema = z.object({
  forecast: z.object({ id: z.string(), lockedHash: z.string() }),
});
export const LedgerAccountCreateResponseSchema = z.object({
  account: z.object({ id: z.string() }),
});
export const OrgCreateResponseSchema = z.object({ organization: z.object({ id: z.string() }) });
export const OrgListResponseSchema = z.object({
  pendingInvitations: z.array(z.object({ id: z.string(), orgId: z.string() })).optional(),
});
export const IcApprovalResponseSchema = z.object({ approval: z.object({ id: z.string() }) });
export const ThesisUpdatedAtResponseSchema = z.object({
  thesis: z.object({ updatedAt: z.string() }),
});

export const HealthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded"]),
  timestamp: z.string(),
  secUserAgentConfigured: z.boolean(),
  jobQueue: z
    .object({
      pending: z.number(),
      running: z.number(),
      failed: z.number(),
    })
    .passthrough()
    .nullable(),
});

export const SecSyncResponseSchema = z.object({
  snapshot: z.object({ ticker: z.string(), entityName: z.string() }).nullable(),
  warehouseSynced: z.boolean(),
  restatements: z.array(
    z.object({
      concept: z.string(),
      periodEnd: z.string(),
      kind: z.string(),
    }),
  ),
});

export async function parseApiResponse<T>(
  response: APIResponse,
  schema: z.ZodType<T>,
  label: string,
): Promise<T> {
  const raw: unknown = await response.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Contract mismatch [${label}]: ${parsed.error.message}`);
  }
  return parsed.data;
}
