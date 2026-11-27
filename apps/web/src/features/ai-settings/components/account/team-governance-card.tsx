"use client";

import { Badge, Button, Input, SettingsSectionLabel } from "@kanon/ui";
import { IconUsersGroup } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiAcceptOrgInvite,
  apiAddRestrictedTicker,
  apiCreateOrg,
  apiInviteOrgMember,
  apiLoadOrgsWorkspace,
  type OrgRoleValue,
  type OrgsWorkspaceSnapshot,
} from "../../lib/orgs-api";
import { AuditLogStrip, OrgInviteForm, OrgRestrictForm } from "./team-governance-parts";

function useTeamGovernanceState() {
  const [data, setData] = useState<OrgsWorkspaceSnapshot | null>(null);
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setData(await apiLoadOrgsWorkspace());
  }, []);

  useEffect(() => void refresh(), [refresh]);

  const run = async (
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    okMsg: string,
  ) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      toast.success(okMsg);
      await refresh();
      return true;
    }
    toast.error(res.error);
    return false;
  };

  return {
    data,
    orgName,
    setOrgName,
    busy,
    createOrg: () =>
      run(() => apiCreateOrg(orgName.trim()), "已创建团队空间").then((ok) => ok && setOrgName("")),
    invite: (orgId: string, phone: string, role: OrgRoleValue) =>
      run(() => apiInviteOrgMember({ orgId, phone, role }), "邀请已发送"),
    acceptInvite: (invitationId: string) =>
      run(() => apiAcceptOrgInvite(invitationId), "已加入团队空间"),
    restrict: (orgId: string, ticker: string, reason: string) =>
      run(
        () => apiAddRestrictedTicker({ orgId, ticker, reason: reason || "合规限制" }),
        `已限制买入 ${ticker}`,
      ),
  };
}

function ActiveOrgControls({
  org,
  restricted,
  busy,
  onInvite,
  onRestrict,
}: {
  org: OrgsWorkspaceSnapshot["organizations"][number];
  restricted: readonly { ticker: string; reason: string; addedAt: string }[];
  busy: boolean;
  onInvite: (orgId: string, phone: string, role: OrgRoleValue) => Promise<boolean>;
  onRestrict: (orgId: string, ticker: string, reason: string) => Promise<boolean>;
}) {
  const canRestrict = org.role === "owner" || org.role === "compliance";
  return (
    <div className="space-y-3">
      {org.role === "owner" ? (
        <OrgInviteForm orgId={org.id} busy={busy} onInvite={onInvite} />
      ) : null}
      {canRestrict ? <OrgRestrictForm orgId={org.id} busy={busy} onRestrict={onRestrict} /> : null}
      {restricted.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <span>限制买入：</span>
          {restricted.map((t) => (
            <Badge key={t.ticker} variant="warn">
              {t.ticker}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CreateOrgForm({
  orgName,
  busy,
  onChange,
  onCreate,
}: {
  orgName: string;
  busy: boolean;
  onChange: (v: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={orgName}
        onChange={(e) => onChange(e.target.value)}
        placeholder="输入买方团队名称"
        className="flex-1"
      />
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        disabled={!orgName.trim()}
        onClick={onCreate}
      >
        <span>创建团队</span>
      </Button>
    </div>
  );
}

function PendingInvitationsStrip({
  invitations,
  busy,
  onAccept,
}: {
  invitations: ReadonlyArray<{ id: string; orgName: string; role: string }>;
  busy: boolean;
  onAccept: (id: string) => void;
}) {
  if (invitations.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      {invitations.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-ink-secondary">
            受邀加入「{inv.orgName}」· {inv.role}
          </span>
          <Button variant="outline" size="xs" loading={busy} onClick={() => onAccept(inv.id)}>
            <span>接受邀请</span>
          </Button>
        </div>
      ))}
    </div>
  );
}

export function TeamGovernanceCard() {
  const s = useTeamGovernanceState();
  const activeOrg = s.data?.organizations[0];
  const restricted = s.data?.restrictedByOrg.find((r) => r.orgId === activeOrg?.id)?.tickers ?? [];
  const memberCount =
    s.data?.membersByOrg.find((m) => m.orgId === activeOrg?.id)?.members.length ?? 0;

  return (
    <div>
      <SettingsSectionLabel>团队协作与合规审计</SettingsSectionLabel>
      <div className="space-y-4 rounded-panel border border-hairline bg-surface p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-primary">
          <IconUsersGroup size={15} stroke={1.5} className="text-ink-muted" />
          <span>{activeOrg ? activeOrg.name : "个人独立工作区"}</span>
          {activeOrg ? (
            <Badge variant="mono">
              {activeOrg.role} · {memberCount} 人
            </Badge>
          ) : null}
        </div>
        {activeOrg ? (
          <ActiveOrgControls
            org={activeOrg}
            restricted={restricted}
            busy={s.busy}
            onInvite={s.invite}
            onRestrict={s.restrict}
          />
        ) : (
          <CreateOrgForm
            orgName={s.orgName}
            busy={s.busy}
            onChange={s.setOrgName}
            onCreate={() => void s.createOrg()}
          />
        )}
        <PendingInvitationsStrip
          invitations={s.data?.pendingInvitations ?? []}
          busy={s.busy}
          onAccept={(id) => void s.acceptInvite(id)}
        />
        <AuditLogStrip logs={s.data?.recentAuditLogs ?? []} />
      </div>
    </div>
  );
}
