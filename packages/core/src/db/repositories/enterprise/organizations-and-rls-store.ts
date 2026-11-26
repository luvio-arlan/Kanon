import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import {
  membershipsTable,
  type OrgRole,
  organizationsTable,
  thesesTable,
  usersTable,
} from "../../schema";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

export type OrgCapability =
  | "org.read"
  | "org.manage_members"
  | "thesis.edit"
  | "ic.submit"
  | "ic.decide"
  | "compliance.restrict"
  | "audit.read";

const ROLE_CAPABILITIES: Record<OrgRole, ReadonlySet<OrgCapability>> = {
  viewer: new Set(["org.read"]),
  compliance: new Set(["org.read", "compliance.restrict", "audit.read"]),
  analyst: new Set(["org.read", "thesis.edit", "ic.submit"]),
  pm: new Set(["org.read", "thesis.edit", "ic.submit", "ic.decide", "audit.read"]),
  owner: new Set([
    "org.read",
    "org.manage_members",
    "thesis.edit",
    "ic.submit",
    "ic.decide",
    "compliance.restrict",
    "audit.read",
  ]),
};

function slugifyOrgName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base || "team"}-${suffix}`;
}

export async function createOrganization(
  db: KanonDb,
  input: { name: string; createdBy: string },
): Promise<OrganizationSummary> {
  const id = `org_${crypto.randomUUID()}`;
  const slug = slugifyOrgName(input.name);
  const name = input.name.trim() || "KANON Team";
  await runInTransaction(db, async (tx) => {
    await tx.insert(organizationsTable).values({ id, name, slug, createdBy: input.createdBy });
    await tx.insert(membershipsTable).values({ orgId: id, userId: input.createdBy, role: "owner" });
  });
  return { id, name, slug, role: "owner" };
}

export async function addOrgMember(
  db: KanonDb,
  input: { orgId: string; userId: string; role: OrgRole },
): Promise<void> {
  await db
    .insert(membershipsTable)
    .values({ orgId: input.orgId, userId: input.userId, role: input.role })
    .onConflictDoUpdate({
      target: [membershipsTable.orgId, membershipsTable.userId],
      set: { role: input.role },
    });
}

export async function getOrgMemberRole(
  db: KanonDb,
  orgId: string,
  userId: string,
): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: membershipsTable.role })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.orgId, orgId), eq(membershipsTable.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export function hasOrgCapability(role: OrgRole | null, capability: OrgCapability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].has(capability);
}

export async function listUserOrganizations(
  db: KanonDb,
  userId: string,
): Promise<OrganizationSummary[]> {
  return db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      role: membershipsTable.role,
    })
    .from(membershipsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, membershipsTable.orgId))
    .where(eq(membershipsTable.userId, userId))
    .orderBy(asc(organizationsTable.createdAt));
}

export async function listOrgMembers(db: KanonDb, orgId: string) {
  return db
    .select({
      orgId: membershipsTable.orgId,
      userId: membershipsTable.userId,
      role: membershipsTable.role,
      createdAt: membershipsTable.createdAt,
    })
    .from(membershipsTable)
    .where(eq(membershipsTable.orgId, orgId))
    .orderBy(asc(membershipsTable.createdAt));
}

export async function findUserByPhoneE164(db: KanonDb, phoneE164: string) {
  const [row] = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.phoneE164, phoneE164))
    .limit(1);
  return row ?? null;
}

export async function assignThesisToOrganization(
  db: KanonDb,
  input: { thesisId: string; userId: string; orgId: string | null },
) {
  const updated = await db
    .update(thesesTable)
    .set({ orgId: input.orgId })
    .where(and(eq(thesesTable.id, input.thesisId), eq(thesesTable.userId, input.userId)))
    .returning();
  return updated[0] ? { id: updated[0].id, orgId: updated[0].orgId } : null;
}
