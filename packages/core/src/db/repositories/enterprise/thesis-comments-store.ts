import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { thesisCommentsTable } from "../../schema";

export async function addThesisComment(
  db: KanonDb,
  input: {
    thesisId: string;
    userId: string;
    anchorType?: string;
    anchorId?: string | null;
    body: string;
  },
) {
  const id = `cmt_${crypto.randomUUID()}`;
  await db.insert(thesisCommentsTable).values({
    id,
    thesisId: input.thesisId,
    userId: input.userId,
    anchorType: input.anchorType ?? "thesis",
    anchorId: input.anchorId ?? null,
    body: input.body.trim(),
  });
  return id;
}

export async function listThesisComments(db: KanonDb, thesisId: string) {
  return db
    .select()
    .from(thesisCommentsTable)
    .where(eq(thesisCommentsTable.thesisId, thesisId))
    .orderBy(desc(thesisCommentsTable.createdAt));
}
