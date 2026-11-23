import {
  type EarningsDigest,
  EarningsDigestSchema,
  type InvestmentMemo,
  InvestmentMemoSchema,
  type RedTeamReport,
  RedTeamReportSchema,
} from "@kanon/ai";
import type { SavedCopilotOutput } from "@kanon/core";
import {
  getKanonDb,
  getSecSnapshot,
  getThesisById,
  listCopilotOutputs,
  listGlossaryTerms,
  listTheses,
} from "@kanon/core/db";
import { notFound } from "next/navigation";
import { ResearchCanvasShell } from "@/features/thesis";

export const dynamic = "force-dynamic";

interface ThesisPageProps {
  params: Promise<{ id: string }>;
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

export default async function ThesisCanvasPage({ params }: ThesisPageProps) {
  const { id } = await params;
  const db = await getKanonDb();
  const [thesis, glossary, allTheses, savedOutputs] = await Promise.all([
    getThesisById(db, id),
    listGlossaryTerms(db),
    listTheses(db),
    listCopilotOutputs(db, id),
  ]);

  if (!thesis) {
    notFound();
  }

  const secSnapshot = await getSecSnapshot(db, thesis.ticker);
  return (
    <ResearchCanvasShell
      initialThesis={thesis}
      allTheses={allTheses}
      glossary={glossary}
      initialSecSnapshot={secSnapshot}
      initialCopilot={hydrateCopilotOutputs(savedOutputs)}
    />
  );
}
