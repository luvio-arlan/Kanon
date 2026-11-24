import { formatPortfolioCsv } from "@kanon/core";
import { getKanonDb, listTheses } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const db = await getKanonDb();
  const theses = await listTheses(db, auth.user.id);
  const csv = formatPortfolioCsv(theses);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kanon-portfolio-odds.csv"',
    },
  });
}
