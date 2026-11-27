import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  type CreateResearchNoteInput,
  CreateResearchNoteSchema,
  type ResearchNote,
  type UpdateResearchNoteInput,
  UpdateResearchNoteSchema,
} from "../../../schemas/v7-research-os";
import type { KanonDb } from "../../client";
import { researchNotesTable } from "../../schema";

type NoteRow = typeof researchNotesTable.$inferSelect;

function mapRow(row: NoteRow): ResearchNote {
  return {
    id: row.id,
    thesisId: row.thesisId,
    kind: row.kind,
    periodLabel: row.periodLabel,
    title: row.title,
    content: row.content,
    guidanceMetric: row.guidanceMetric,
    guidancePromised: row.guidancePromised,
    guidanceDelivered: row.guidanceDelivered,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listResearchNotes(
  db: KanonDb,
  thesisId: string,
  limit = 24,
): Promise<ResearchNote[]> {
  const rows = await db
    .select()
    .from(researchNotesTable)
    .where(eq(researchNotesTable.thesisId, thesisId))
    .orderBy(desc(researchNotesTable.updatedAt))
    .limit(limit);
  return rows.map(mapRow);
}

export async function createResearchNote(
  db: KanonDb,
  params: { thesisId: string; userId: string; input: CreateResearchNoteInput },
): Promise<ResearchNote> {
  const parsed = CreateResearchNoteSchema.parse(params.input);
  const now = new Date();
  const id = `note-${crypto.randomUUID().slice(0, 8)}`;
  const [inserted] = await db
    .insert(researchNotesTable)
    .values({
      id,
      thesisId: params.thesisId,
      userId: params.userId,
      kind: parsed.kind,
      periodLabel: parsed.periodLabel,
      title: parsed.title,
      content: parsed.content,
      guidanceMetric: parsed.guidanceMetric,
      guidancePromised: parsed.guidancePromised,
      guidanceDelivered: parsed.guidanceDelivered,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!inserted) throw new Error("创建一手资料记录失败");
  return mapRow(inserted);
}

export async function updateResearchNote(
  db: KanonDb,
  params: { thesisId: string; userId: string; input: UpdateResearchNoteInput },
): Promise<ResearchNote | null> {
  const parsed = UpdateResearchNoteSchema.parse(params.input);
  const { noteId, ...rawFields } = parsed;
  const patch: Partial<typeof researchNotesTable.$inferInsert> = { updatedAt: new Date() };
  if (rawFields.kind !== undefined) patch.kind = rawFields.kind;
  if (rawFields.periodLabel !== undefined) patch.periodLabel = rawFields.periodLabel;
  if (rawFields.title !== undefined) patch.title = rawFields.title;
  if (rawFields.content !== undefined) patch.content = rawFields.content;
  if (rawFields.guidanceMetric !== undefined) patch.guidanceMetric = rawFields.guidanceMetric;
  if (rawFields.guidancePromised !== undefined) patch.guidancePromised = rawFields.guidancePromised;
  if (rawFields.guidanceDelivered !== undefined) {
    patch.guidanceDelivered = rawFields.guidanceDelivered;
  }
  const [updated] = await db
    .update(researchNotesTable)
    .set(patch)
    .where(
      and(
        eq(researchNotesTable.id, noteId),
        eq(researchNotesTable.thesisId, params.thesisId),
        eq(researchNotesTable.userId, params.userId),
      ),
    )
    .returning();
  return updated ? mapRow(updated) : null;
}

export async function deleteResearchNote(
  db: KanonDb,
  params: { thesisId: string; userId: string; noteId: string },
): Promise<boolean> {
  const deleted = await db
    .delete(researchNotesTable)
    .where(
      and(
        eq(researchNotesTable.id, params.noteId),
        eq(researchNotesTable.thesisId, params.thesisId),
        eq(researchNotesTable.userId, params.userId),
      ),
    )
    .returning();
  return deleted.length > 0;
}
