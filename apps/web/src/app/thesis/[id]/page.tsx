import { getKanonDb, getSecSnapshot, getThesisById, listGlossaryTerms } from "@kanon/core/db";
import { notFound } from "next/navigation";
import { ResearchCanvasShell } from "@/features/thesis";

export const dynamic = "force-dynamic";

interface ThesisPageProps {
  params: Promise<{ id: string }>;
}

export default async function ThesisCanvasPage({ params }: ThesisPageProps) {
  const { id } = await params;
  const db = await getKanonDb();
  const [thesis, glossary] = await Promise.all([getThesisById(db, id), listGlossaryTerms(db)]);

  if (!thesis) {
    notFound();
  }

  const secSnapshot = await getSecSnapshot(db, thesis.ticker);
  return (
    <ResearchCanvasShell
      initialThesis={thesis}
      glossary={glossary}
      initialSecSnapshot={secSnapshot}
    />
  );
}
