import {
  type EarningsDigest,
  EarningsDigestSchema,
  type InvestmentMemo,
  InvestmentMemoSchema,
  type RedTeamReport,
  RedTeamReportSchema,
  type SavedCopilotOutput,
} from "@kanon/core";
import { getKanonDb, getThesisIdentity, loadThesisCanvasBootstrap } from "@kanon/core/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";
import { ResearchCanvasShell } from "@/features/thesis";

export const dynamic = "force-dynamic";

interface ThesisPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}

function parseInitialStep(raw?: string): 1 | 2 | 3 | 4 | 5 {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return 1;
}

function parseRow<T>(
  rows: readonly SavedCopilotOutput[],
  action: SavedCopilotOutput["action"],
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false } },
): T | null {
  const match = rows.find((row) => row.action === action);
  if (!match) return null;
  const parsed = schema.safeParse(match.payload);
  return parsed.success ? parsed.data : null;
}

function hydrateCopilotOutputs(rows: readonly SavedCopilotOutput[]) {
  return {
    redTeam: parseRow<RedTeamReport>(rows, "red_team", RedTeamReportSchema),
    digest: parseRow<EarningsDigest>(rows, "earnings_digest", EarningsDigestSchema),
    investmentMemo: parseRow<InvestmentMemo>(rows, "investment_memo", InvestmentMemoSchema),
  };
}

export async function generateMetadata({ params }: ThesisPageProps): Promise<Metadata> {
  const [{ id }, auth] = await Promise.all([params, getServerAuthContext()]);
  if (!auth.user) return { title: "研究画布 — KANON 卡农" };
  const identity = await getThesisIdentity(await getKanonDb(), id, auth.user.id);
  if (!identity) return { title: "研究画布 — KANON 卡农" };
  return { title: `${identity.ticker} · ${identity.companyName} — KANON 卡农` };
}

export default async function ThesisCanvasPage({ params, searchParams }: ThesisPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const auth = await getServerAuthContext();
  const initialStep = parseInitialStep(query.step);
  if (!auth.user) {
    const returnPath = initialStep > 1 ? `/thesis/${id}?step=${initialStep}` : `/thesis/${id}`;
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }
  const db = await getKanonDb();
  const data = await loadThesisCanvasBootstrap(db, id, auth.user.id);
  if (!data) {
    notFound();
  }

  return (
    <ResearchCanvasShell
      currentUser={auth.user}
      initialThesis={data.thesis}
      initialStep={initialStep}
      allTheses={data.allTheses}
      glossary={data.glossary}
      initialSecSnapshot={data.secSnapshot}
      initialCopilot={hydrateCopilotOutputs(data.savedOutputs)}
      initialRevisions={data.revisions}
      initialReviews={data.reviews}
      initialAgentRun={data.latestAgentRun}
      inboundCrossChecks={data.inboundCrossChecks}
      initialResearchNotes={data.researchNotes}
    />
  );
}
