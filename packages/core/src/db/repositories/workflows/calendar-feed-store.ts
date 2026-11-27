import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { calendarTokensTable, thesesTable, thesisCatalystsTable } from "../../schema";
import { buildThesisReadAccessWhere } from "../thesis/thesis-access";

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
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Folds a single ICS content line at <= 75 UTF-8 octets per RFC 5545 Section 3.1. */
export function foldIcsLine(line: string, maxOctets = 75): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= maxOctets) return line;
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = maxOctets;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (currentBytes + chBytes > limit && current.length > 0) {
      out.push(current);
      current = ` ${ch}`;
      currentBytes = 1 + chBytes;
      limit = maxOctets;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current.length > 0) out.push(current);
  return out.join("\r\n");
}

function formatIcsUtcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Resolves the owner userId for a hashed calendar subscription token (system context). */
export async function resolveCalendarTokenUserId(
  db: KanonDb,
  token: string,
): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const hashed = hashCalendarToken(trimmed);
  const [tok] = await db
    .select({ userId: calendarTokensTable.userId })
    .from(calendarTokensTable)
    .where(eq(calendarTokensTable.tokenHash, hashed))
    .limit(1);
  return tok?.userId ?? null;
}

/** Builds an RFC 5545 `.ics` calendar feed for an authenticated/resolved user inside tenant context. */
export async function buildCatalystIcsFeedForUser(db: KanonDb, userId: string): Promise<string> {
  const accessWhere = await buildThesisReadAccessWhere(db, userId);
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
    .where(accessWhere);

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
      foldIcsLine(`SUMMARY:[${escapeIcsText(row.ticker)}] ${escapeIcsText(row.title)}`),
      foldIcsLine(`DESCRIPTION:${escapeIcsText(`${row.dateLabel} · ${row.verificationMetric}`)}`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

/** Builds an RFC 5545 `.ics` calendar feed of explicitly dated catalysts across personal + org theses. */
export async function buildCatalystIcsFeed(db: KanonDb, token: string): Promise<string | null> {
  const userId = await resolveCalendarTokenUserId(db, token);
  if (!userId) return null;
  return buildCatalystIcsFeedForUser(db, userId);
}
