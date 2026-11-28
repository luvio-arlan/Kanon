import { sql } from "drizzle-orm";
import type { HealthDbPosture } from "../../../contracts/ops";
import type { KanonDb } from "../../bootstrap";

/** Probes live Postgres role BYPASSRLS/superuser flags and fail-closed `kanon_rls_open()` state (U0-10 / G28). */
export async function getDbSecurityPosture(tx: KanonDb): Promise<HealthDbPosture> {
  const res = await tx.execute(sql`
    SELECT r.rolbypassrls, r.rolsuper, kanon_rls_open() AS rls_open
    FROM pg_roles r
    WHERE r.rolname = current_user
  `);
  const rows = (Array.isArray(res) ? res : res.rows) as Array<Record<string, unknown>>;
  const row = rows[0];
  const rolBypass = Boolean(row?.rolbypassrls);
  const rolSuper = Boolean(row?.rolsuper);
  const rlsOpen = row ? Boolean(row.rls_open) : true;
  return {
    bypassRls: rolBypass || rolSuper,
    rlsFailClosed: !rlsOpen,
  };
}
