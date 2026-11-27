import crypto from "node:crypto";
import { asc, inArray } from "drizzle-orm";
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
