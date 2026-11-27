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
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid() OR (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = theses.org_id AND m.user_id = kanon_rls_uid() AND m.accepted_at IS NOT NULL))`,
    }),
    pgPolicy("kanon_rls_theses_insert", {
      for: "insert",
      withCheck: USER_PRED,
    }),
    pgPolicy("kanon_rls_theses_update", {
      for: "update",
      using: sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(id)`,
      withCheck: sql`kanon_rls_is_system() OR kanon_rls_open() OR (user_id = kanon_rls_uid() AND (org_id IS NULL OR EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = theses.org_id AND m.user_id = kanon_rls_uid() AND m.accepted_at IS NOT NULL AND m.role IN ('owner', 'pm', 'analyst')))) OR (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = theses.org_id AND m.user_id = kanon_rls_uid() AND m.accepted_at IS NOT NULL AND m.role IN ('owner', 'pm', 'analyst')))`,
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
