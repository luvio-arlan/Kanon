import { fetchSecEdgarSnapshot, fetchSecFilingReaderData } from "@kanon/ai";
import { getKanonDb, getSecSnapshot, upsertSecSnapshot } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { jsonError, jsonOk } from "../../../_lib/http";
import { checkRateLimit } from "../../../_lib/request-guards";

export const dynamic = "force-dynamic";

const SEC_FILING_RATE_POLICY = {
  bucket: "sec_filing_reader",
  maxRequests: 25,
  windowMs: 60 * 1000,
};

export async function GET(request: Request, context: { params: Promise<{ ticker: string }> }) {
  const startedAt = performance.now();
  const rateErr = checkRateLimit(request, SEC_FILING_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const { ticker } = await context.params;
  const cleanTicker = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) {
    return jsonError("无效的美股代码。", 400, startedAt, "INVALID_TICKER");
  }

  const url = new URL(request.url);
  const accessionNumber = url.searchParams.get("accession")?.trim() || undefined;
  const form = url.searchParams.get("form")?.trim() || undefined;

  const db = await getKanonDb();
  let snapshot = await getSecSnapshot(db, cleanTicker);
  if (!snapshot) {
    const liveSnap = await fetchSecEdgarSnapshot(cleanTicker);
    if (liveSnap.ok) {
      snapshot = await upsertSecSnapshot(db, liveSnap.data);
    }
  }

  const readerData = await fetchSecFilingReaderData({
    ticker: cleanTicker,
    snapshot,
    accessionNumber,
    form,
  });
  return jsonOk(readerData, startedAt);
}
