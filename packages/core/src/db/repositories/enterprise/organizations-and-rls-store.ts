import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { membershipsTable, type OrgRole, organizationsTable } from "../../schema";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 1,
  compliance: 2,
  analyst: 3,
  pm: 4,
  owner: 5,
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
  await db.insert(organizationsTable).values({ id, name, slug, createdBy: input.createdBy });
  await db.insert(membershipsTable).values({ orgId: id, userId: input.createdBy, role: "owner" });
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

export function roleMeetsMinimum(role: OrgRole | null, minimum: OrgRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
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
