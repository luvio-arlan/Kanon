import { fetchSecEdgarSnapshot } from "@kanon/ai";
import { getKanonDb, getSecSnapshot, upsertSecSnapshot } from "@kanon/core/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { ticker } = await context.params;
  const db = await getKanonDb();
  const snapshot = await getSecSnapshot(db, ticker);
  return NextResponse.json({ snapshot });
}

export async function POST(_request: Request, context: RouteContext) {
  const { ticker } = await context.params;
  const db = await getKanonDb();
  const fetched = await fetchSecEdgarSnapshot(ticker);

  if (fetched.ok) {
    const saved = await upsertSecSnapshot(db, fetched.data);
    return NextResponse.json({
      snapshot: saved,
      live: true,
      notice: `已从 SEC EDGAR 官方接口同步 ${saved.entityName} 最新 10-K/10-Q 与财务锚点。`,
    });
  }

  const cached = await getSecSnapshot(db, ticker);
  return NextResponse.json({
    snapshot: cached,
    live: false,
    notice: fetched.error,
  });
}
