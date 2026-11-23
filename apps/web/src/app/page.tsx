import { getKanonDb, listGlossaryTerms, listTheses } from "@kanon/core/db";
import { CockpitShell } from "@/features/thesis";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = await getKanonDb();
  const [theses, glossary] = await Promise.all([listTheses(db), listGlossaryTerms(db)]);
  return <CockpitShell initialTheses={theses} glossary={glossary} />;
}
