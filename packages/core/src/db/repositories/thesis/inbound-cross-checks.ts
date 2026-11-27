import { and, eq } from "drizzle-orm";
import type { InboundCrossCheck } from "../../../schemas/research";
import type { KanonDb } from "../../client";
import { crossChecksTable, thesesTable } from "../../schema";

export async function listInboundCrossChecks(
  db: KanonDb,
  targetThesisId: string,
  userId?: string,
): Promise<InboundCrossCheck[]> {
  const whereClause = userId
    ? and(eq(crossChecksTable.linkedThesisId, targetThesisId), eq(thesesTable.userId, userId))
    : eq(crossChecksTable.linkedThesisId, targetThesisId);
  return db
    .select({
      id: crossChecksTable.id,
      sourceThesisId: crossChecksTable.thesisId,
      sourceTicker: thesesTable.ticker,
      sourceCompanyName: thesesTable.companyName,
      peerRole: crossChecksTable.peerRole,
      topic: crossChecksTable.topic,
      sourceAnchor: crossChecksTable.sourceAnchor,
      statement: crossChecksTable.statement,
      alignment: crossChecksTable.alignment,
      takeaway: crossChecksTable.takeaway,
    })
    .from(crossChecksTable)
    .innerJoin(thesesTable, eq(crossChecksTable.thesisId, thesesTable.id))
    .where(whereClause);
}
