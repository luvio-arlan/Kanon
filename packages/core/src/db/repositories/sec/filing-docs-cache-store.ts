import { desc, eq } from "drizzle-orm";
import {
  type SecFilingReaderResponse,
  SecFilingReaderResponseSchema,
} from "../../../contracts/sec-filing-contracts";
import type { KanonDb } from "../../client";
import { secFilingDocumentsCacheTable } from "../../schema";

function mapRowToReaderResponse(
  row: typeof secFilingDocumentsCacheTable.$inferSelect,
): SecFilingReaderResponse | null {
  const fullExcerpt = row.sectionsJson
    .slice(0, 2)
    .flatMap((s) => [`[${s.heading}]`, ...s.paragraphs.slice(0, 8)])
    .join("\n\n");
  const parsed = SecFilingReaderResponseSchema.safeParse({
    ticker: row.ticker,
    form: row.form,
    filingDate: row.filingDate,
    accessionNumber: row.accessionNumber,
    documentUrl: row.documentUrl,
    source: "sec-edgar-live",
    cached: true,
    sections: row.sectionsJson,
    fullExcerpt,
    diff: row.diffJson ?? null,
    notice: `已从本地缓存即时加载 ${row.form} (${row.filingDate}) 原文（${row.sectionsJson.length} 个核心章节）`,
  });
  return parsed.success ? parsed.data : null;
}

export async function getCachedSecFilingDoc(
  db: KanonDb,
  accessionNumber: string,
): Promise<SecFilingReaderResponse | null> {
  const cleanAcc = accessionNumber.trim();
  if (!cleanAcc) return null;
  const [row] = await db
    .select()
    .from(secFilingDocumentsCacheTable)
    .where(eq(secFilingDocumentsCacheTable.accessionNumber, cleanAcc))
    .limit(1);
  return row ? mapRowToReaderResponse(row) : null;
}

export async function listCachedSecFilingDocsByTicker(
  db: KanonDb,
  ticker: string,
  limit = 3,
): Promise<SecFilingReaderResponse[]> {
  const upper = ticker.trim().toUpperCase();
  const rows = await db
    .select()
    .from(secFilingDocumentsCacheTable)
    .where(eq(secFilingDocumentsCacheTable.ticker, upper))
    .orderBy(desc(secFilingDocumentsCacheTable.filingDate))
    .limit(limit);

  const out: SecFilingReaderResponse[] = [];
  for (const row of rows) {
    const mapped = mapRowToReaderResponse(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function upsertCachedSecFilingDoc(
  db: KanonDb,
  doc: SecFilingReaderResponse,
): Promise<void> {
  if (doc.source !== "sec-edgar-live" || !doc.accessionNumber) return;
  const now = new Date();
  await db
    .insert(secFilingDocumentsCacheTable)
    .values({
      accessionNumber: doc.accessionNumber,
      ticker: doc.ticker.toUpperCase(),
      form: doc.form,
      filingDate: doc.filingDate,
      documentUrl: doc.documentUrl,
      sectionsJson: doc.sections,
      diffJson: doc.diff,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: secFilingDocumentsCacheTable.accessionNumber,
      set: {
        sectionsJson: doc.sections,
        diffJson: doc.diff,
        fetchedAt: now,
      },
    });
}
