import { formatPortfolioCsv } from "@kanon/core";
import { getKanonDb, listTheses } from "@kanon/core/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getKanonDb();
  const theses = await listTheses(db);
  const csv = formatPortfolioCsv(theses);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kanon-portfolio-odds.csv"',
    },
  });
}
