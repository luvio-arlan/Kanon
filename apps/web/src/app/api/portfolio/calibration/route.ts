import {
  buildWeeklyIcDigest,
  calculatePortfolioCalibration,
  type QuarterlyReview,
} from "@kanon/core";
import { listQuarterlyReviewsByThesisIds, listTheses } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const { theses, reviews } = await auth.withDb(async (tx) => {
    const list = await listTheses(tx, auth.user.id);
    const revs = await listQuarterlyReviewsByThesisIds(
      tx,
      list.map((t) => t.id),
    );
    return { theses: list, reviews: revs };
  });
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
