import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import type { KanonDb } from "../../bootstrap";
import {
  type AlertRuleKind,
  alertRulesTable,
  type ForecastKind,
  forecastsTable,
  type InboxSeverity,
  inboxItemsTable,
} from "../../schema";

export {
  buildCatalystIcsFeed,
  hasCalendarToken,
  issueCalendarToken,
} from "./calendar-feed-store";

export async function upsertAlertRule(
  db: KanonDb,
  input: {
    userId: string;
    thesisId?: string | null;
    kind: AlertRuleKind;
    configJson: Record<string, unknown>;
    enabled?: boolean;
  },
) {
  const thesisId = input.thesisId ?? null;
  const enabled = input.enabled ?? true;
  const existingCond = thesisId
    ? and(
        eq(alertRulesTable.userId, input.userId),
        eq(alertRulesTable.thesisId, thesisId),
        eq(alertRulesTable.kind, input.kind),
      )
    : and(
        eq(alertRulesTable.userId, input.userId),
        isNull(alertRulesTable.thesisId),
        eq(alertRulesTable.kind, input.kind),
      );
  const [existing] = await db
    .select({ id: alertRulesTable.id })
    .from(alertRulesTable)
    .where(existingCond)
    .limit(1);
  if (existing) {
    await db
      .update(alertRulesTable)
      .set({ configJson: input.configJson, enabled })
      .where(and(eq(alertRulesTable.id, existing.id), eq(alertRulesTable.userId, input.userId)));
    return existing.id;
  }
  const id = `rule_${crypto.randomUUID()}`;
  await db
    .insert(alertRulesTable)
    .values({
      id,
      userId: input.userId,
      thesisId,
      kind: input.kind,
      configJson: input.configJson,
      enabled,
    })
    .onConflictDoNothing();
  return id;
}

export async function listAlertRules(db: KanonDb, userId: string) {
  return db
    .select()
    .from(alertRulesTable)
    .where(eq(alertRulesTable.userId, userId))
    .orderBy(desc(alertRulesTable.createdAt));
}

export async function createInboxItem(
  db: KanonDb,
  input: {
    userId: string;
    thesisId?: string | null;
    kind: string;
    severity?: InboxSeverity;
    title: string;
    body: string;
    sourceUrl?: string | null;
  },
) {
  const id = `ibx_${crypto.randomUUID()}`;
  const now = new Date();
  await db
    .insert(inboxItemsTable)
    .values({
      id,
      userId: input.userId,
      thesisId: input.thesisId ?? null,
      kind: input.kind,
      severity: input.severity ?? "info",
      title: input.title.trim(),
      body: input.body.trim(),
      sourceUrl: input.sourceUrl ?? null,
      createdAt: now,
    })
    .onConflictDoNothing();
  return id;
}

export async function listInboxItems(db: KanonDb, userId: string, limit = 50) {
  return db
    .select()
    .from(inboxItemsTable)
    .where(eq(inboxItemsTable.userId, userId))
    .orderBy(desc(inboxItemsTable.createdAt))
    .limit(limit);
}

export async function markInboxItemRead(
  db: KanonDb,
  userId: string,
  itemId: string,
): Promise<boolean> {
  const updated = await db
    .update(inboxItemsTable)
    .set({ readAt: new Date() })
    .where(and(eq(inboxItemsTable.id, itemId), eq(inboxItemsTable.userId, userId)))
    .returning();
  return updated.length > 0;
}

export async function markAllInboxItemsRead(db: KanonDb, userId: string): Promise<number> {
  const updated = await db
    .update(inboxItemsTable)
    .set({ readAt: new Date() })
    .where(and(eq(inboxItemsTable.userId, userId), isNull(inboxItemsTable.readAt)))
    .returning();
  return updated.length;
}

export async function createImmutableForecast(
  db: KanonDb,
  input: {
    userId: string;
    thesisId: string;
    hypothesisId?: string | null;
    question: string;
    forecastKind?: ForecastKind;
    probabilities: number[];
    resolveBy: string;
  },
) {
  const allBounded = input.probabilities.every((p) => Number.isFinite(p) && p >= 0 && p <= 1);
  const sum = input.probabilities.reduce((a, b) => a + b, 0);
  if (input.probabilities.length < 2 || !allBounded || Math.abs(sum - 1) > 0.02) {
    throw new Error("预测单项概率须在 0–1 之间且之和等于 1.0（误差 ≤ 2%）。");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.resolveBy) || input.resolveBy <= todayIsoUtc()) {
    throw new Error("到期日期必须晚于今天，禁止事后补录预测。");
  }
  const id = `fc_${crypto.randomUUID()}`;
  const lockedAt = new Date();
  const canonical = JSON.stringify({
    id,
    thesisId: input.thesisId,
    question: input.question.trim(),
    probabilities: input.probabilities,
    resolveBy: input.resolveBy,
    lockedAt: lockedAt.toISOString(),
  });
  const lockedHash = crypto.createHash("sha256").update(canonical).digest("hex");
  await db.insert(forecastsTable).values({
    id,
    userId: input.userId,
    thesisId: input.thesisId,
    hypothesisId: input.hypothesisId ?? null,
    question: input.question.trim(),
    forecastKind: input.forecastKind ?? "binary",
    probabilitiesJson: input.probabilities,
    resolveBy: input.resolveBy,
    lockedAt,
    lockedHash,
  });
  return { id, lockedHash, lockedAt: lockedAt.toISOString() };
}

export async function resolveForecast(
  db: KanonDb,
  input: {
    userId: string;
    thesisId?: string;
    forecastId: string;
    outcomeIndex: number;
    note?: string;
  },
): Promise<boolean> {
  const baseCond = input.thesisId
    ? and(
        eq(forecastsTable.id, input.forecastId),
        eq(forecastsTable.userId, input.userId),
        eq(forecastsTable.thesisId, input.thesisId),
      )
    : and(eq(forecastsTable.id, input.forecastId), eq(forecastsTable.userId, input.userId));
  const [row] = await db.select().from(forecastsTable).where(baseCond).limit(1);
  if (!row || row.resolvedAt !== null) return false;
  if (
    !Number.isInteger(input.outcomeIndex) ||
    input.outcomeIndex < 0 ||
    input.outcomeIndex >= row.probabilitiesJson.length
  ) {
    throw new Error("outcomeIndex 超出预测选项范围。");
  }
  const updated = await db
    .update(forecastsTable)
    .set({
      resolvedAt: new Date(),
      outcomeJson: { outcomeIndex: input.outcomeIndex, note: input.note?.trim() },
    })
    .where(
      and(baseCond, eq(forecastsTable.userId, input.userId), isNull(forecastsTable.resolvedAt)),
    )
    .returning();
  return updated.length > 0;
}

export async function listForecasts(db: KanonDb, userId: string, thesisId?: string) {
  const cond = thesisId
    ? and(eq(forecastsTable.userId, userId), eq(forecastsTable.thesisId, thesisId))
    : eq(forecastsTable.userId, userId);
  return db.select().from(forecastsTable).where(cond).orderBy(desc(forecastsTable.lockedAt));
}

export async function listEnabledForm8kAlertRecipients(
  db: KanonDb,
  thesisIds: readonly string[],
): Promise<Array<{ userId: string; thesisId: string }>> {
  if (thesisIds.length === 0) return [];
  const rows = await db
    .select({ userId: alertRulesTable.userId, thesisId: alertRulesTable.thesisId })
    .from(alertRulesTable)
    .where(
      and(
        eq(alertRulesTable.kind, "form8k_redflag"),
        eq(alertRulesTable.enabled, true),
        inArray(alertRulesTable.thesisId, [...thesisIds]),
      ),
    );
  return rows.filter((r): r is { userId: string; thesisId: string } => Boolean(r.thesisId));
}
