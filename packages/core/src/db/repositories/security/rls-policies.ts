import { sql } from "drizzle-orm";
import { pgPolicy } from "drizzle-orm/pg-core";

const USER_PRED = sql`kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid()`;
const THESIS_READ_PRED = sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id)`;
const THESIS_WRITE_PRED = sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(thesis_id)`;

export function kanonUserOwnedPolicies(tableName: string) {
  return [
    pgPolicy(`kanon_rls_${tableName}_select`, { for: "select", using: USER_PRED }),
    pgPolicy(`kanon_rls_${tableName}_write`, {
      for: "all",
      using: USER_PRED,
      withCheck: USER_PRED,
    }),
  ];
}

export function kanonThesisChildPolicies(tableName: string) {
  return [
    pgPolicy(`kanon_rls_${tableName}_select`, { for: "select", using: THESIS_READ_PRED }),
    pgPolicy(`kanon_rls_${tableName}_write`, {
      for: "all",
      using: THESIS_WRITE_PRED,
      withCheck: THESIS_WRITE_PRED,
    }),
  ];
}

export function kanonThesesPolicies() {
  return [
    pgPolicy("kanon_rls_theses_select", {
      for: "select",
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid() OR (org_id IS NOT NULL AND kanon_org_role(org_id) IS NOT NULL)`,
    }),
    pgPolicy("kanon_rls_theses_insert", {
      for: "insert",
      withCheck: USER_PRED,
    }),
    pgPolicy("kanon_rls_theses_update", {
      for: "update",
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(id)`,
      withCheck: sql`kanon_rls_is_system() OR kanon_rls_open() OR (user_id = kanon_rls_uid() AND (org_id IS NULL OR kanon_org_role(org_id) IN ('owner', 'pm', 'analyst'))) OR (org_id IS NOT NULL AND kanon_org_role(org_id) IN ('owner', 'pm', 'analyst'))`,
    }),
    pgPolicy("kanon_rls_theses_delete", {
      for: "delete",
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_deletable(id)`,
    }),
  ];
}

export function kanonResearchNotesPolicies() {
  const authorReadPred = sql`kanon_rls_is_system() OR kanon_rls_open() OR (user_id = kanon_rls_uid() AND kanon_thesis_readable(thesis_id))`;
  return [
    pgPolicy("kanon_rls_research_notes_select", { for: "select", using: THESIS_READ_PRED }),
    pgPolicy("kanon_rls_research_notes_insert", {
      for: "insert",
      withCheck: sql`kanon_rls_is_system() OR kanon_rls_open() OR (kanon_thesis_writable(thesis_id) AND user_id = kanon_rls_uid())`,
    }),
    pgPolicy("kanon_rls_research_notes_update", {
      for: "update",
      using: authorReadPred,
      withCheck: authorReadPred,
    }),
    pgPolicy("kanon_rls_research_notes_delete", { for: "delete", using: USER_PRED }),
  ];
}

export function kanonPublicDerivedPolicies(tableName: string) {
  const sysPred = sql`kanon_rls_is_system()`;
  return [
    pgPolicy(`kanon_rls_${tableName}_read`, { for: "select", using: sql`true` }),
    pgPolicy(`kanon_rls_${tableName}_write`, {
      for: "all",
      using: sysPred,
      withCheck: sysPred,
    }),
  ];
}

export function kanonSystemOnlyPolicy(tableName: string) {
  const sysPred = sql`kanon_rls_is_system()`;
  return [
    pgPolicy(`kanon_rls_${tableName}_system`, {
      for: "all",
      using: sysPred,
      withCheck: sysPred,
    }),
  ];
}

export function kanonThesisCommentsPolicies() {
  return [
    pgPolicy("kanon_rls_thesis_comments_select", { for: "select", using: THESIS_READ_PRED }),
    pgPolicy("kanon_rls_thesis_comments_insert", {
      for: "insert",
      withCheck: sql`kanon_rls_is_system() OR kanon_rls_open() OR (kanon_thesis_readable(thesis_id) AND user_id = kanon_rls_uid())`,
    }),
    pgPolicy("kanon_rls_thesis_comments_update", {
      for: "update",
      using: USER_PRED,
      withCheck: USER_PRED,
    }),
    pgPolicy("kanon_rls_thesis_comments_delete", { for: "delete", using: USER_PRED }),
  ];
}

/**
 * Append-only audit chain (V2-1 / Stage 6b): actors insert only as themselves; actors read their own rows
 * and org owners read their org's rows. No UPDATE/DELETE policy exists (also REVOKEd from the app role).
 * The global chain tail is read through the definer `kanon_audit_chain_tail()` so RLS never forks the chain.
 */
export function kanonAuditLogPolicies() {
  return [
    pgPolicy("kanon_rls_audit_log_select", {
      for: "select",
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR actor_user_id = kanon_rls_uid() OR (org_id IS NOT NULL AND kanon_org_role(org_id) = 'owner')`,
    }),
    pgPolicy("kanon_rls_audit_log_insert", {
      for: "insert",
      withCheck: sql`kanon_rls_is_system() OR kanon_rls_open() OR actor_user_id = kanon_rls_uid()`,
    }),
  ];
}

export function kanonMembershipsPolicies() {
  const ownerPred = sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) = 'owner'`;
  return [
    pgPolicy("kanon_rls_memberships_select", {
      for: "select",
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid() OR kanon_org_role(org_id) IS NOT NULL`,
    }),
    pgPolicy("kanon_rls_memberships_write", {
      for: "all",
      using: ownerPred,
      withCheck: ownerPred,
    }),
  ];
}

export function kanonOrgInvitationsPolicies() {
  const mgrPred = sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) IN ('owner', 'pm')`;
  return [
    pgPolicy("kanon_rls_org_invitations_select", {
      for: "select",
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR invitee_user_id = kanon_rls_uid() OR kanon_org_role(org_id) IN ('owner', 'pm')`,
    }),
    pgPolicy("kanon_rls_org_invitations_write", {
      for: "all",
      using: mgrPred,
      withCheck: mgrPred,
    }),
  ];
}

export function kanonRestrictedListPolicies() {
  const compPred = sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) IN ('owner', 'compliance')`;
  return [
    pgPolicy("kanon_rls_restricted_list_select", {
      for: "select",
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_org_role(org_id) IS NOT NULL`,
    }),
    pgPolicy("kanon_rls_restricted_list_write", {
      for: "all",
      using: compPred,
      withCheck: compPred,
    }),
  ];
}
