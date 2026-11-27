import { and, eq, inArray, or } from "drizzle-orm";
import type { KanonDb } from "../../client";
import { type OrgRole, thesesTable } from "../../schema";
import {
  getOrgMemberRole,
  hasOrgCapability,
  listUserOrgIds,
  listUserOrgIdsByRoles,
} from "../enterprise/organizations-and-rls-store";
import { detectFactRestatements } from "../warehouse/facts-pit-store";
import { getSecurityByTicker } from "../warehouse/securities-and-fx-store";

export type ThesisCapability = "read" | "write" | "delete" | "decide" | "comment";
export type ThesisAccessMode = ThesisCapability;

export interface ThesisAccess {
  thesisId: string;
  userId: string;
  ownerUserId: string;
  orgId: string | null;
  role: "owner" | OrgRole;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canDecide: boolean;
  canComment: boolean;
}

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

export async function buildThesisWriteAccessWhere(db: KanonDb, userId: string) {
  const orgIds = await listUserOrgIdsByRoles(db, userId, ["owner", "pm", "analyst"]);
  return orgIds.length > 0
    ? or(eq(thesesTable.userId, userId), inArray(thesesTable.orgId, orgIds))
    : eq(thesesTable.userId, userId);
}

export async function buildThesisDeleteAccessWhere(db: KanonDb, userId: string) {
  const orgIds = await listUserOrgIdsByRoles(db, userId, ["owner"]);
  return orgIds.length > 0
    ? or(eq(thesesTable.userId, userId), inArray(thesesTable.orgId, orgIds))
    : eq(thesesTable.userId, userId);
}

export function hasThesisCapability(access: ThesisAccess, need: ThesisCapability): boolean {
  if (need === "read") return access.canRead;
  if (need === "write") return access.canWrite;
  if (need === "delete") return access.canDelete;
  if (need === "decide") return access.canDecide;
  return access.canComment;
}

/**
 * Resolves full capability-aware access for a user on a thesis.
 * - Personal thesis owner has all capabilities (including self-attested decide).
 * - Org-shared thesis grants read/comment to all accepted members, write to owner/pm/analyst,
 *   decide to owner/pm, and delete to thesis owner or org owner.
 */
export async function getThesisAccess(
  db: KanonDb,
  id: string,
  userId: string,
): Promise<ThesisAccess | null> {
  const [row] = await db
    .select({ id: thesesTable.id, userId: thesesTable.userId, orgId: thesesTable.orgId })
    .from(thesesTable)
    .where(eq(thesesTable.id, id))
    .limit(1);
  if (!row) return null;
  const orgId = row.orgId ?? null;
  if (row.userId === userId) {
    const orgRole = orgId ? await getOrgMemberRole(db, orgId, userId) : null;
    return {
      thesisId: row.id,
      userId,
      ownerUserId: row.userId,
      orgId,
      role: orgRole ?? "owner",
      canRead: true,
      canWrite: true,
      canDelete: true,
      canDecide: orgId ? hasOrgCapability(orgRole, "ic.decide") : true,
      canComment: true,
    };
  }
  if (!orgId) return null;
  const role = await getOrgMemberRole(db, orgId, userId);
  if (!role || !hasOrgCapability(role, "org.read")) return null;
  return {
    thesisId: row.id,
    userId,
    ownerUserId: row.userId,
    orgId,
    role,
    canRead: true,
    canWrite: hasOrgCapability(role, "thesis.edit"),
    canDelete: role === "owner",
    canDecide: hasOrgCapability(role, "ic.decide"),
    canComment: true,
  };
}

export async function assertThesisAccess(
  db: KanonDb,
  id: string,
  userId: string,
  mode: ThesisCapability = "read",
): Promise<boolean> {
  const access = await getThesisAccess(db, id, userId);
  return access ? hasThesisCapability(access, mode) : false;
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
