import crypto from "node:crypto";
import { eq, or } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { calendarTokensTable, thesesTable, thesisCatalystsTable } from "../../schema";

function hashCalendarToken(raw: string): string {
  return crypto.createHash("sha256").update(`kanon-ics:${raw.trim()}`).digest("hex");
}

export async function hasCalendarToken(db: KanonDb, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: calendarTokensTable.userId })
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.userId, userId))
    .limit(1);
  return Boolean(row);
}

export async function issueCalendarToken(db: KanonDb, userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(20).toString("hex");
  const tokenHash = hashCalendarToken(rawToken);
  await db
    .insert(calendarTokensTable)
    .values({ token: tokenHash, userId, tokenHash })
    .onConflictDoUpdate({
      target: calendarTokensTable.userId,
      set: { token: tokenHash, tokenHash, createdAt: new Date() },
    });
  return rawToken;
}

function escapeIcsText(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function formatIcsUtcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Builds an RFC 5545 `.ics` calendar feed of explicitly dated catalysts. */
export async function buildCatalystIcsFeed(db: KanonDb, token: string): Promise<string | null> {
  const trimmed = token.trim();
  const hashed = hashCalendarToken(trimmed);
  const [tok] = await db
    .select()
    .from(calendarTokensTable)
    .where(or(eq(calendarTokensTable.tokenHash, hashed), eq(calendarTokensTable.token, trimmed)))
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

  const dtstamp = formatIcsUtcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KANON//Catalyst Calendar//EN",
    "X-WR-CALNAME:KANON Catalysts",
  ];
  for (const row of rows) {
    if (!row.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.eventDate)) continue;
    const dt = row.eventDate.replaceAll("-", "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${row.id}@kanon.hk`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dt}`,
      `SUMMARY:[${escapeIcsText(row.ticker)}] ${escapeIcsText(row.title)}`,
      `DESCRIPTION:${escapeIcsText(`${row.dateLabel} · ${row.verificationMetric}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
