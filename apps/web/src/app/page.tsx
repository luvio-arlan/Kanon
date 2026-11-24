import { getKanonDb, listGlossaryTerms, listTheses } from "@kanon/core/db";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";
import { CockpitShell } from "@/features/cockpit";
import { LandingShell } from "@/features/landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const auth = await getServerAuthContext();
  if (!auth.user) {
    return <LandingShell currentUser={null} isDemo={false} />;
  }

  const db = await getKanonDb();
  const [theses, glossary] = await Promise.all([
    listTheses(db, auth.user.id),
    listGlossaryTerms(db),
  ]);
  return (
    <CockpitShell
      initialTheses={theses}
      glossary={glossary}
      currentUser={auth.user}
      isDemo={auth.isDemo}
    />
  );
}
