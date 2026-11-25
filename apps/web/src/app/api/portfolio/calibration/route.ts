import {
  buildWeeklyIcDigest,
  calculatePortfolioCalibration,
  type QuarterlyReview,
} from "@kanon/core";
import { getKanonDb, listQuarterlyReviewsByThesisIds, listTheses } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const db = await getKanonDb();
  const theses = await listTheses(db, auth.user.id);
  const reviews = await listQuarterlyReviewsByThesisIds(
    db,
    theses.map((t) => t.id),
  );
  const reviewsByThesis = new Map<string, QuarterlyReview[]>();
  for (const rev of reviews) {
    const existing = reviewsByThesis.get(rev.thesisId);
    if (existing) existing.push(rev);
    else reviewsByThesis.set(rev.thesisId, [rev]);
  }
  const calibration = calculatePortfolioCalibration(theses, reviewsByThesis);
  const digest = buildWeeklyIcDigest(theses, calibration);
  return jsonOk({ calibration, digest }, startedAt);
}
