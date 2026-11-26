import crypto from "node:crypto";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
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

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

export async function upsertFilingChunks(
  db: KanonDb,
  chunks: readonly FilingChunkInput[],
): Promise<number> {
  for (const c of chunks) {
    const contentHash = sha256Text(c.text);
    const [existing] = await db
      .select({ contentHash: filingChunksTable.contentHash })
      .from(filingChunksTable)
      .where(eq(filingChunksTable.id, c.id))
      .limit(1);
    if (existing && existing.contentHash === contentHash) continue;

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
        contentHash,
        embeddingJson: null,
      })
      .onConflictDoUpdate({
        target: filingChunksTable.id,
        set: {
          text: c.text,
          charStart: c.charStart ?? 0,
          charEnd: c.charEnd ?? c.text.length,
          contentHash,
          embeddingJson: null,
        },
      });
  }
  return chunks.length;
}

export async function listChunksPendingEmbedding(db: KanonDb, limit = 50) {
  return db
    .select({ id: filingChunksTable.id, text: filingChunksTable.text })
    .from(filingChunksTable)
    .where(isNull(filingChunksTable.embeddingJson))
    .limit(limit);
}

export async function saveChunkEmbedding(
  db: KanonDb,
  chunkId: string,
  embedding: readonly number[],
): Promise<void> {
  await db
    .update(filingChunksTable)
    .set({ embeddingJson: [...embedding] })
    .where(eq(filingChunksTable.id, chunkId));
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
