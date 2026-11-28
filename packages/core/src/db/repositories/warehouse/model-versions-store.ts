import crypto from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { modelVersionsTable } from "../../schema";

export interface ModelVersionRecord {
  id: string;
  thesisId: string;
  userId: string;
  versionNum: number;
  label: string;
  modelKind: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  notes: string;
  createdAt: string;
}

export interface ModelVersionDiffItem {
  key: string;
  before: unknown;
  after: unknown;
}

export async function saveModelVersion(
  db: KanonDb,
  input: {
    thesisId: string;
    userId: string;
    label: string;
    modelKind?: string;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    notes?: string;
  },
): Promise<ModelVersionRecord> {
  const [maxRow] = await db
    .select({ maxNum: sql<number>`coalesce(max(${modelVersionsTable.versionNum}), 0)::int` })
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.thesisId, input.thesisId));
  const versionNum = Number(maxRow?.maxNum ?? 0) + 1;
  const id = `mv_${crypto.randomUUID()}`;
  const now = new Date();
  await db.insert(modelVersionsTable).values({
    id,
    thesisId: input.thesisId,
    userId: input.userId,
    versionNum,
    label: input.label.trim() || `v${versionNum}`,
    modelKind: input.modelKind ?? "fcff_dcf",
    inputsJson: input.inputs,
    outputsJson: input.outputs,
    notes: input.notes?.trim() ?? "",
    createdAt: now,
  });
  return {
    id,
    thesisId: input.thesisId,
    userId: input.userId,
    versionNum,
    label: input.label.trim() || `v${versionNum}`,
    modelKind: input.modelKind ?? "fcff_dcf",
    inputs: input.inputs,
    outputs: input.outputs,
    notes: input.notes?.trim() ?? "",
    createdAt: now.toISOString(),
  };
}

export async function listModelVersions(
  db: KanonDb,
  thesisId: string,
  limit = 20,
): Promise<ModelVersionRecord[]> {
  const rows = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.thesisId, thesisId))
    .orderBy(desc(modelVersionsTable.versionNum))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    thesisId: r.thesisId,
    userId: r.userId,
    versionNum: r.versionNum,
    label: r.label,
    modelKind: r.modelKind,
    inputs: r.inputsJson,
    outputs: r.outputsJson,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}
