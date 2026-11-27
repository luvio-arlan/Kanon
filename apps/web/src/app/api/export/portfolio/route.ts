import { formatPortfolioCsv } from "@kanon/core";
import { listTheses } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { apiHeaders } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const theses = await auth.withDb((tx) => listTheses(tx, auth.user.id));
  const csv = formatPortfolioCsv(theses);
  return new Response(csv, {
    headers: {
      ...apiHeaders(startedAt),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kanon-portfolio-odds.csv"',
    },
  });
}
