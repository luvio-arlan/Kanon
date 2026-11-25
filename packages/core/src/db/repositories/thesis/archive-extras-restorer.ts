import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { ThesisArchiveImportRequest } from "../../../contracts/api-contracts";
import type { KanonDb } from "../../client";
import {
  agentRunsTable,
  copilotOutputsTable,
  quarterlyReviewsTable,
  researchNotesTable,
} from "../../schema";

export function safeImportDate(raw: string): Date {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function restoreReviewsAndCopilot(params: {
  tx: KanonDb;
  targetId: string;
  archive: ThesisArchiveImportRequest["archive"];
  hypIdMap: ReadonlyMap<string, string>;
  clearExisting: boolean;
}) {
  const { tx, targetId, archive, hypIdMap, clearExisting } = params;
  if (clearExisting || (archive.quarterlyReviews?.length ?? 0) > 0) {
    await tx.delete(quarterlyReviewsTable).where(eq(quarterlyReviewsTable.thesisId, targetId));
  }
  if (archive.quarterlyReviews && archive.quarterlyReviews.length > 0) {
    await tx.insert(quarterlyReviewsTable).values(
      archive.quarterlyReviews.map((rev, idx) => ({
        ...rev,
        id: `${targetId}-qrev-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        thesisId: targetId,
        hypothesisVerdicts: rev.hypothesisVerdicts.map((v) => ({
          ...v,
          hypothesisId: hypIdMap.get(v.hypothesisId) ?? v.hypothesisId,
        })),
        createdAt: safeImportDate(rev.createdAt),
      })),
    );
  }
  if (clearExisting || (archive.copilotOutputs?.length ?? 0) > 0) {
    await tx.delete(copilotOutputsTable).where(eq(copilotOutputsTable.thesisId, targetId));
  }
  if (archive.copilotOutputs && archive.copilotOutputs.length > 0) {
    const deduped = new Map(archive.copilotOutputs.map((out) => [out.action, out]));
    await tx.insert(copilotOutputsTable).values(
      [...deduped.values()].map((out) => ({
        id: `${targetId}:${out.action}`,
        thesisId: targetId,
        action: out.action,
        engine: out.engine,
        payload: out.payload,
        updatedAt: safeImportDate(out.updatedAt),
      })),
    );
  }
}

export async function restoreArchiveExtras(params: {
  tx: KanonDb;
  targetId: string;
  userId: string;
  archive: ThesisArchiveImportRequest["archive"];
  hypIdMap: ReadonlyMap<string, string>;
  clearExisting: boolean;
}) {
  await restoreReviewsAndCopilot(params);
  const { tx, targetId, userId, archive, clearExisting } = params;
  if (clearExisting || (archive.agentRuns?.length ?? 0) > 0) {
    await tx.delete(agentRunsTable).where(eq(agentRunsTable.thesisId, targetId));
  }
  if (archive.agentRuns && archive.agentRuns.length > 0) {
    await tx.insert(agentRunsTable).values(
      archive.agentRuns.map((run, idx) => ({
        id: `${targetId}-run-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        thesisId: targetId,
        engine: run.engine,
        fallbackReason: run.fallbackReason,
        briefingJson: run.briefing,
        appliedProposalIds: run.appliedProposalIds,
        createdAt: safeImportDate(run.createdAt),
      })),
    );
  }
  if (clearExisting || (archive.researchNotes?.length ?? 0) > 0) {
    await tx.delete(researchNotesTable).where(eq(researchNotesTable.thesisId, targetId));
  }
  if (archive.researchNotes && archive.researchNotes.length > 0) {
    await tx.insert(researchNotesTable).values(
      archive.researchNotes.map((note, idx) => ({
        id: `${targetId}-note-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        thesisId: targetId,
        userId,
        kind: note.kind,
        periodLabel: note.periodLabel,
        title: note.title,
        content: note.content,
        guidanceMetric: note.guidanceMetric,
        guidancePromised: note.guidancePromised,
        guidanceDelivered: note.guidanceDelivered,
        createdAt: safeImportDate(note.createdAt),
        updatedAt: safeImportDate(note.updatedAt),
      })),
    );
  }
}
