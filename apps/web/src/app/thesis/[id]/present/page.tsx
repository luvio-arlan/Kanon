import { computeGuidanceCredibility, inferCurrencyFromTicker } from "@kanon/core";
import {
  getFilingRedline,
  getSecurityByTicker,
  getThesisIdentity,
  type KanonDb,
  listGuidanceCommitments,
  listPeriodicFilingsBySecurity,
  loadThesisCanvasBootstrap,
} from "@kanon/core/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";
import { withUserDb } from "@/app/api/_lib/db-context";
import { type PresentRedlineSummary, ThesisPresentDeck } from "@/features/thesis-present";

export const dynamic = "force-dynamic";

interface PresentPageProps {
  params: Promise<{ id: string }>;
}

async function loadLatestRedline(
  tx: KanonDb,
  ticker: string,
): Promise<PresentRedlineSummary | null> {
  const sec = await getSecurityByTicker(tx, ticker);
  if (!sec) return null;
  const filings = await listPeriodicFilingsBySecurity(tx, sec.id, { limit: 12 });
  const current = filings[0];
  if (!current || filings.length < 2) return null;
  const currentBase = current.form.replace("/A", "");
  const previous = filings.find((f, idx) => idx > 0 && f.form.replace("/A", "") === currentBase);
  if (!previous) return null;
  const cached =
    (await getFilingRedline(tx, {
      currentAccession: current.accession,
      previousAccession: previous.accession,
      sectionCode: "risk_factors",
    })) ??
    (await getFilingRedline(tx, {
      currentAccession: current.accession,
      previousAccession: previous.accession,
      sectionCode: "mda",
    }));
  if (cached?.status !== "ready") return null;
  return {
    form: current.form,
    currentPeriod: current.periodEnd ?? current.filedAt,
    previousPeriod: previous.periodEnd ?? previous.filedAt,
    sectionCode: cached.sectionCode,
    stats: cached.stats,
    changes: cached.changes,
  };
}

export async function generateMetadata({ params }: PresentPageProps): Promise<Metadata> {
  const [{ id }, auth] = await Promise.all([params, getServerAuthContext()]);
  if (!auth.user) return { title: "投委会演示 — KANON 卡农" };
  const userId = auth.user.id;
  const identity = await withUserDb(userId, (tx) => getThesisIdentity(tx, id, userId));
  if (!identity) return { title: "投委会演示 — KANON 卡农" };
  return { title: `${identity.ticker} · 投委会演示 — KANON 卡农` };
}

export default async function ThesisPresentPage({ params }: PresentPageProps) {
  const [{ id }, auth] = await Promise.all([params, getServerAuthContext()]);
  if (!auth.user) {
    redirect(`/login?next=${encodeURIComponent(`/thesis/${id}/present`)}`);
  }
  const userId = auth.user.id;
  const payload = await withUserDb(userId, async (tx) => {
    const data = await loadThesisCanvasBootstrap(tx, id, userId);
    if (!data) return null;
    const [guidance, redline] = await Promise.all([
      listGuidanceCommitments(tx, id),
      loadLatestRedline(tx, data.thesis.ticker),
    ]);
    return {
      thesis: data.thesis,
      currency: inferCurrencyFromTicker(data.thesis.ticker) ?? "USD",
      guidance,
      credibility: computeGuidanceCredibility(guidance),
      redline,
    };
  });
  if (!payload) notFound();

  return <ThesisPresentDeck data={payload} />;
}
