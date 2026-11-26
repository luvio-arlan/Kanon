import { z } from "zod";

export const InboxItemRowSchema = z.object({
  id: z.string(),
  thesisId: z.string().nullable().optional(),
  severity: z.enum(["critical", "warn", "info"]),
  title: z.string(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const InboxLoadResponseSchema = z.object({
  items: z.array(InboxItemRowSchema),
  calendarConfigured: z.boolean().optional(),
});

export const CalendarRotateResponseSchema = z.object({
  calendarToken: z.string().min(1),
});

export const GenericOkResponseSchema = z.object({
  ok: z.boolean(),
});

export const LedgerAccountListResponseSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      cashBalance: z.number(),
      noLeverageAcknowledgedAt: z.string().nullable().optional(),
      positions: z.array(
        z.object({
          ticker: z.string(),
          shares: z.number(),
          avgCostBasis: z.number(),
          totalCost: z.number(),
        }),
      ),
    }),
  ),
});

export const LedgerAccountCreateResponseSchema = z.object({
  account: z.object({ id: z.string() }),
});

export const LedgerTransactionCreateResponseSchema = z.object({
  result: z.object({ transactionId: z.string() }),
});

export const ForecastListResponseSchema = z.object({
  forecasts: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      probabilitiesJson: z.array(z.number()),
      resolveBy: z.string(),
      lockedHash: z.string(),
      outcomeJson: z.object({ outcomeIndex: z.number(), note: z.string().optional() }).nullable(),
    }),
  ),
  resolvedCount: z.number().int().nonnegative().optional(),
  brierScore: z.number().nullable(),
  logLoss: z.number().nullable().optional(),
});

export const IcApprovalsListResponseSchema = z.object({
  approvals: z.array(
    z.object({
      id: z.string(),
      orgId: z.string().nullable().optional(),
      state: z.enum(["draft", "in_review", "approved", "rejected", "archived"]),
      submittedBy: z.string().optional(),
      decidedBy: z.string().nullable().optional(),
      decisionNote: z.string(),
      snapshotHash: z.string().optional(),
      createdAt: z.string(),
      updatedAt: z.string().optional(),
    }),
  ),
});

export const ForecastCreateResponseSchema = z.object({
  forecast: z.object({ id: z.string(), lockedHash: z.string() }),
});

export const IcApprovalMutationResponseSchema = z.object({
  approval: z.object({ id: z.string(), state: z.string() }),
});

export const ModelVersionsListResponseSchema = z.object({
  versions: z.array(
    z.object({
      id: z.string(),
      versionNum: z.number(),
      label: z.string(),
      createdAt: z.string(),
      outputs: z.record(z.string(), z.unknown()),
    }),
  ),
});

export const ModelVersionSaveResponseSchema = z.object({
  version: z.object({ id: z.string(), versionNum: z.number() }),
});

export const OrgsLoadResponseSchema = z.object({
  organizations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(["owner", "pm", "analyst", "viewer", "compliance"]),
    }),
  ),
  restrictedByOrg: z.array(
    z.object({
      orgId: z.string(),
      tickers: z.array(
        z.object({
          ticker: z.string(),
          reason: z.string(),
          addedAt: z.string(),
        }),
      ),
    }),
  ),
  membersByOrg: z.array(
    z.object({
      orgId: z.string(),
      members: z.array(
        z.object({
          userId: z.string(),
          role: z.enum(["owner", "pm", "analyst", "viewer", "compliance"]),
        }),
      ),
    }),
  ),
  recentAuditLogs: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      targetType: z.string(),
      targetId: z.string(),
      entryHash: z.string().optional(),
      createdAt: z.string(),
    }),
  ),
});

export const OrgCreateResponseSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
});

export const OrgMemberAddResponseSchema = z.object({
  member: z.object({ userId: z.string(), role: z.string() }),
});

export const OrgRestrictResponseSchema = z.object({
  restricted: z.object({ ticker: z.string() }),
});
