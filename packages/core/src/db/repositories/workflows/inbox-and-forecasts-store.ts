import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import {
  type AlertRuleKind,
  alertRulesTable,
  calendarTokensTable,
  type ForecastKind,
  forecastsTable,
  type InboxSeverity,
  inboxItemsTable,
  thesesTable,
  thesisCatalystsTable,
} from "../../schema";

export async function upsertAlertRule(
  db: KanonDb,
  input: {
    id?: string;
    userId: string;
    thesisId?: string | null;
    kind: AlertRuleKind;
    configJson: Record<string, unknown>;
    enabled?: boolean;
  },
) {
  const id = input.id ?? `rule_${crypto.randomUUID()}`;
  await db
    .insert(alertRulesTable)
    .values({
      id,
      userId: input.userId,
      thesisId: input.thesisId ?? null,
      kind: input.kind,
      configJson: input.configJson,
      enabled: input.enabled ?? true,
    })
    .onConflictDoUpdate({
      target: alertRulesTable.id,
      set: { configJson: input.configJson, enabled: input.enabled ?? true },
    });
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
  await db.insert(inboxItemsTable).values({
    id,
    userId: input.userId,
    thesisId: input.thesisId ?? null,
    kind: input.kind,
    severity: input.severity ?? "info",
    title: input.title.trim(),
    body: input.body.trim(),
    sourceUrl: input.sourceUrl ?? null,
    createdAt: now,
  });
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
  const sum = input.probabilities.reduce((a, b) => a + b, 0);
  if (input.probabilities.length < 2 || Math.abs(sum - 1) > 0.02) {
    throw new Error("预测概率之和必须等于 1.0（误差 ≤ 2%）。");
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
  input: { userId: string; forecastId: string; outcomeIndex: number; note?: string },
): Promise<boolean> {
  const updated = await db
    .update(forecastsTable)
    .set({
      resolvedAt: new Date(),
      outcomeJson: { outcomeIndex: input.outcomeIndex, note: input.note?.trim() },
    })
    .where(and(eq(forecastsTable.id, input.forecastId), eq(forecastsTable.userId, input.userId)))
    .returning();
  return updated.length > 0;
}

export async function listForecasts(db: KanonDb, userId: string, thesisId?: string) {
  const cond = thesisId
    ? and(eq(forecastsTable.userId, userId), eq(forecastsTable.thesisId, thesisId))
    : eq(forecastsTable.userId, userId);
  return db.select().from(forecastsTable).where(cond).orderBy(desc(forecastsTable.lockedAt));
}

export async function issueCalendarToken(db: KanonDb, userId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.userId, userId))
    .limit(1);
  if (existing) return existing.token;
  const token = crypto.randomBytes(18).toString("hex");
  await db.insert(calendarTokensTable).values({ token, userId });
  return token;
}

function escapeIcsText(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Builds an RFC 5545 `.ics` calendar feed of dated catalysts for an authenticated token. */
export async function buildCatalystIcsFeed(db: KanonDb, token: string): Promise<string | null> {
  const [tok] = await db
    .select()
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.token, token.trim()))
    .limit(1);
  if (!tok) return null;
  const rows = await db
    .select({
      id: thesisCatalystsTable.id,
      title: thesisCatalystsTable.title,
      dateLabel: thesisCatalystsTable.dateLabel,
      eventDate: thesisCatalystsTable.eventDate,
      verificationMetric: thesisCatalystsTable.verificationMetric,
      ticker: thesesTable.ticker,
    })
    .from(thesisCatalystsTable)
    .innerJoin(thesesTable, eq(thesesTable.id, thesisCatalystsTable.thesisId))
    .where(eq(thesesTable.userId, tok.userId));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KANON//Catalyst Calendar//EN",
    "X-WR-CALNAME:KANON Catalysts",
  ];
  for (const row of rows) {
    const dt = (row.eventDate ?? new Date().toISOString().slice(0, 10)).replaceAll("-", "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${row.id}@kanon.hk`,
      `DTSTART;VALUE=DATE:${dt}`,
      `SUMMARY:[${escapeIcsText(row.ticker)}] ${escapeIcsText(row.title)}`,
      `DESCRIPTION:${escapeIcsText(`${row.dateLabel} · ${row.verificationMetric}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
