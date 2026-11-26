import { getKanonDb, listGlossaryTerms, listTheses } from "@kanon/core/db";
import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";
import { buildCockpitViewSearch, CockpitShell, parseCockpitViewState } from "@/features/cockpit";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [auth, params] = await Promise.all([getServerAuthContext(), searchParams]);
  const initialView = parseCockpitViewState(params);
  if (!auth.user) {
    const search = buildCockpitViewSearch(initialView);
    redirect(search ? `/login?next=${encodeURIComponent(`/${search}`)}` : "/login");
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
      initialView={initialView}
    />
  );
}
