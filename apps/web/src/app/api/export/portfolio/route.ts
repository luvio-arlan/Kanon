import { formatPortfolioCsv } from "@kanon/core";
import { listDecisionSnapshotsByUser, listTheses } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { apiHeaders } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const { theses, snapshots } = await auth.withDb(async (tx) => {
    const [t, s] = await Promise.all([
      listTheses(tx, auth.user.id),
      listDecisionSnapshotsByUser(tx, auth.user.id),
    ]);
    return { theses: t, snapshots: s };
  });
  const hashByThesis = new Map<string, string>();
  for (const snap of snapshots) {
    if (!hashByThesis.has(snap.thesisId)) hashByThesis.set(snap.thesisId, snap.snapshotHash);
  }
  const csv = formatPortfolioCsv(theses, hashByThesis);
  return new Response(csv, {
    headers: {
      ...apiHeaders(startedAt),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kanon-portfolio-odds.csv"',
    },
  });
}
