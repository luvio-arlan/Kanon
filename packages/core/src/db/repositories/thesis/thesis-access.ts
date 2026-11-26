import { and, eq, inArray, or } from "drizzle-orm";
import type { KanonDb } from "../../client";
import { thesesTable } from "../../schema";
import {
  getOrgMemberRole,
  hasOrgCapability,
  listUserOrgIds,
} from "../enterprise/organizations-and-rls-store";
import { detectFactRestatements } from "../warehouse/facts-pit-store";
import { getSecurityByTicker } from "../warehouse/securities-and-fx-store";

export type ThesisAccessMode = "read" | "write" | "delete";

export interface BootstrapRestatementMarker {
  concept: string;
  periodEnd: string;
  originalValue: number;
  restatedValue: number;
  restatedAccession: string;
}

const RESTATEMENT_CONCEPTS = ["revenue", "net_income", "diluted_eps"] as const;

export async function buildThesisReadAccessWhere(db: KanonDb, userId: string) {
  const orgIds = await listUserOrgIds(db, userId);
  return orgIds.length > 0
    ? or(eq(thesesTable.userId, userId), inArray(thesesTable.orgId, orgIds))
    : eq(thesesTable.userId, userId);
}

/**
 * Capability-aware thesis access check:
 * - Owner always has read/write/delete.
 * - Org members get read (`org.read`), write (`thesis.edit`), or delete (`owner` only).
 */
export async function assertThesisAccess(
  db: KanonDb,
  id: string,
  userId: string,
  mode: ThesisAccessMode = "read",
): Promise<boolean> {
  const [row] = await db
    .select({ userId: thesesTable.userId, orgId: thesesTable.orgId })
    .from(thesesTable)
    .where(eq(thesesTable.id, id))
    .limit(1);
  if (!row) return false;
  if (row.userId === userId) return true;
  if (!row.orgId) return false;
  const role = await getOrgMemberRole(db, row.orgId, userId);
  if (mode === "read") return hasOrgCapability(role, "org.read");
  if (mode === "write") return hasOrgCapability(role, "thesis.edit");
  return role === "owner";
}

export async function assertThesisOwnership(
  db: KanonDb,
  id: string,
  userId: string,
): Promise<boolean> {
  return assertThesisAccess(db, id, userId, "read");
}

/** Lightweight tenant/org-scoped identity lookup for page metadata (no child hydration). */
export async function getThesisIdentity(
  db: KanonDb,
  id: string,
  userId: string,
): Promise<{ ticker: string; companyName: string } | null> {
  const access = await buildThesisReadAccessWhere(db, userId);
  const [row] = await db
    .select({ ticker: thesesTable.ticker, companyName: thesesTable.companyName })
    .from(thesesTable)
    .where(and(eq(thesesTable.id, id), access))
    .limit(1);
  return row ?? null;
}

export async function loadRestatementsForTicker(
  db: KanonDb,
  ticker: string,
): Promise<BootstrapRestatementMarker[]> {
  const sec = await getSecurityByTicker(db, ticker);
  if (!sec) return [];
  const groups = await Promise.all(
    RESTATEMENT_CONCEPTS.map((concept) =>
      detectFactRestatements(db, { securityId: sec.id, concept }),
    ),
  );
  return groups.flat().map((r) => ({
    concept: r.concept,
    periodEnd: r.periodEnd,
    originalValue: r.originalValue,
    restatedValue: r.restatedValue,
    restatedAccession: r.restatedAccession,
  }));
}
