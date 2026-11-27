import { listGlossaryTerms, listTheses } from "@kanon/core/db";
import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";
import { withUserDb } from "@/app/api/_lib/db-context";
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
  const userId = auth.user.id;
  const [theses, glossary] = await withUserDb(userId, (tx) =>
    Promise.all([listTheses(tx, userId), listGlossaryTerms(tx)]),
  );
  return (
    <CockpitShell
      initialTheses={theses}
      glossary={glossary}
      currentUser={auth.user}
      initialView={initialView}
    />
  );
}
