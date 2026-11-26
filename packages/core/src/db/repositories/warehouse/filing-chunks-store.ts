import { and, asc, eq, ilike } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { filingChunksTable } from "../../schema";

export interface FilingChunkInput {
  id: string;
  accession: string;
  ticker: string;
  sectionCode: string;
  paraIndex: number;
  text: string;
  charStart?: number;
  charEnd?: number;
}

export async function upsertFilingChunks(
  db: KanonDb,
  chunks: readonly FilingChunkInput[],
): Promise<number> {
  for (const c of chunks) {
    await db
      .insert(filingChunksTable)
      .values({
        id: c.id,
        accession: c.accession,
        ticker: c.ticker.trim().toUpperCase(),
        sectionCode: c.sectionCode,
        paraIndex: c.paraIndex,
        text: c.text,
        charStart: c.charStart ?? 0,
        charEnd: c.charEnd ?? c.text.length,
      })
      .onConflictDoUpdate({
        target: filingChunksTable.id,
        set: { text: c.text, charStart: c.charStart ?? 0, charEnd: c.charEnd ?? c.text.length },
      });
  }
  return chunks.length;
}

export async function searchFilingChunksLexical(
  db: KanonDb,
  params: { ticker: string; keyword: string; limit?: number },
) {
  const kw = params.keyword.trim();
  if (!kw) return [];
  return db
    .select()
    .from(filingChunksTable)
    .where(
      and(
        eq(filingChunksTable.ticker, params.ticker.trim().toUpperCase()),
        ilike(filingChunksTable.text, `%${kw}%`),
      ),
    )
    .orderBy(asc(filingChunksTable.paraIndex))
    .limit(params.limit ?? 12);
}
