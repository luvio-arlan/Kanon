import {
  type EarningsDigest,
  EarningsDigestSchema,
  type InvestmentMemo,
  InvestmentMemoSchema,
  type RedTeamReport,
  RedTeamReportSchema,
} from "@kanon/ai";
import type { SavedCopilotOutput } from "@kanon/core";
import { getKanonDb, loadThesisCanvasBootstrap } from "@kanon/core/db";
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

export default async function ThesisCanvasPage({ params, searchParams }: ThesisPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const auth = await getServerAuthContext();
  if (!auth.user) {
    redirect(`/login?next=${encodeURIComponent(`/thesis/${id}`)}`);
  }
  const db = await getKanonDb();
  const data = await loadThesisCanvasBootstrap(db, id, auth.user.id);
  if (!data) {
    notFound();
  }

  return (
    <ResearchCanvasShell
      initialThesis={data.thesis}
      initialStep={parseInitialStep(query.step)}
      allTheses={data.allTheses}
      glossary={data.glossary}
      initialSecSnapshot={data.secSnapshot}
      initialCopilot={hydrateCopilotOutputs(data.savedOutputs)}
      initialRevisions={data.revisions}
      initialReviews={data.reviews}
      initialAgentRun={data.latestAgentRun}
      inboundCrossChecks={data.inboundCrossChecks}
    />
  );
}
