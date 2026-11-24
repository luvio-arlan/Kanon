import { getKanonDb, listGlossaryTerms, listTheses } from "@kanon/core/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";
import { CockpitShell } from "@/features/cockpit";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const auth = await getServerAuthContext();
  if (!auth.user) {
    redirect("/login");
  }

  const db = await getKanonDb();
  const [theses, glossary, cookieStore] = await Promise.all([
    listTheses(db, auth.user.id),
    listGlossaryTerms(db),
    cookies(),
  ]);
  const initialGuideDismissed = cookieStore.get("kanon_guide_dismissed")?.value === "1";
  return (
    <CockpitShell
      initialTheses={theses}
      glossary={glossary}
      currentUser={auth.user}
      initialGuideDismissed={initialGuideDismissed}
    />
  );
}
