import { eq } from "drizzle-orm";
import { type SavedCopilotOutput, SavedCopilotOutputSchema } from "../../schemas/research";
import type { KanonDb } from "../client";
import { copilotOutputsTable } from "../schema";

export async function listCopilotOutputs(
  db: KanonDb,
  thesisId: string,
): Promise<SavedCopilotOutput[]> {
  const rows = await db
    .select()
    .from(copilotOutputsTable)
    .where(eq(copilotOutputsTable.thesisId, thesisId));

  return rows.map((row) => ({
    action: row.action,
    engine: row.engine,
    payload: row.payload,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function upsertCopilotOutput(
  db: KanonDb,
  thesisId: string,
  input: Omit<SavedCopilotOutput, "updatedAt">,
): Promise<SavedCopilotOutput> {
  const now = new Date();
  const id = `${thesisId}:${input.action}`;
  await db
    .insert(copilotOutputsTable)
    .values({
      id,
      thesisId,
      action: input.action,
      engine: input.engine,
      payload: input.payload,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: copilotOutputsTable.id,
      set: {
        engine: input.engine,
        payload: input.payload,
        updatedAt: now,
      },
    });

  return SavedCopilotOutputSchema.parse({
    ...input,
    updatedAt: now.toISOString(),
  });
}
