import crypto from "node:crypto";
import { asc, inArray, sql } from "drizzle-orm";
import type { HypothesisStatus } from "../../../schemas/thesis";
import type { KanonDb } from "../../bootstrap";
import { type HypothesisEventSource, hypothesisStatusEventsTable } from "../../schema";

export interface AppendHypothesisEventInput {
  thesisId: string;
  hypothesisId: string;
  fromStatus: HypothesisStatus | null;
  toStatus: HypothesisStatus;
  source: HypothesisEventSource;
  actorUserId?: string | null;
  note?: string;
}

/** Append-only audit writer paired with every hypothesis status write (S3 / G14 / G15). */
export async function appendHypothesisStatusEvent(
  tx: KanonDb,
  input: AppendHypothesisEventInput,
): Promise<void> {
  await tx.insert(hypothesisStatusEventsTable).values({
    id: `hse_${crypto.randomUUID()}`,
    thesisId: input.thesisId,
    hypothesisId: input.hypothesisId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    source: input.source,
    actorUserId: input.actorUserId ?? null,
    note: (input.note ?? "").slice(0, 400),
  });
}

export async function listHypothesisStatusEventsByThesisIds(
  tx: KanonDb,
  thesisIds: readonly string[],
) {
  if (thesisIds.length === 0) return [];
  return tx
    .select()
    .from(hypothesisStatusEventsTable)
    .where(inArray(hypothesisStatusEventsTable.thesisId, [...thesisIds]))
    .orderBy(asc(hypothesisStatusEventsTable.recordedAt));
}

/** Returns the ISO timestamp when migration `0033_decision_snapshots` ran to clamp backfill look-ahead (U0-8 / P1-7). */
export async function getMigration0033AppliedAt(tx: KanonDb): Promise<string | null> {
  try {
    const res = await tx.execute(
      sql`SELECT applied_at::text AS applied_at FROM schema_migrations WHERE id = '0033_decision_snapshots' LIMIT 1`,
    );
    const rows = (Array.isArray(res) ? res : res.rows) as Array<{ applied_at?: string }>;
    const raw = rows[0]?.applied_at;
    return typeof raw === "string" && Number.isFinite(Date.parse(raw))
      ? new Date(raw).toISOString()
      : null;
  } catch {
    return null;
  }
}
