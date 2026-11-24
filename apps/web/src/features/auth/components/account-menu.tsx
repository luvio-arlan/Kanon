"use client";

import type { PublicUser } from "@kanon/core";
import { ActionMenu, type ActionMenuItem, cn } from "@kanon/ui";
import { IconArrowUpRight, IconChevronDown, IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logoutAccount } from "../lib/auth-api";

const OFFICIAL_SITE_URL = "https://kanon.hk";

export interface AccountMenuProps {
  currentUser: PublicUser;
  collapsed?: boolean;
  sidebar?: boolean;
}

function buildMemberMenuItems(onLogout: () => void): ActionMenuItem[] {
  return [
    {
      id: "official",
      label: "访问品牌官网 kanon.hk",
      icon: <IconArrowUpRight size={15} stroke={1.5} />,
      onSelect: () => window.open(OFFICIAL_SITE_URL, "_blank", "noopener,noreferrer"),
    },
    {
      id: "logout",
      label: "退出当前账号",
      tone: "danger",
      icon: <IconLogout size={15} stroke={1.5} />,
      onSelect: onLogout,
    },
  ];
}

export function AccountMenu({ currentUser, collapsed = false, sidebar = false }: AccountMenuProps) {
  const router = useRouter();

  async function handleSignOut() {
    const res = await logoutAccount();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("已安全退出账号");
    router.push("/login");
    router.refresh();
  }

  return (
    <ActionMenu
      ariaLabel="当前登录账号菜单"
      placement={sidebar ? "top start" : "bottom end"}
      items={buildMemberMenuItems(() => void handleSignOut())}
      triggerClassName={cn(
        sidebar
          ? collapsed
            ? "h-10 w-10 justify-center px-0"
            : "h-11 w-full justify-between px-3"
          : "h-9 px-3",
      )}
      trigger={
        <span className="inline-flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-2.5 text-sm font-medium text-ink-primary">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-titanium text-xs font-semibold text-ink-primary">
              {currentUser.displayName.slice(0, 1)}
            </span>
            {!collapsed ? <span className="truncate">{currentUser.displayName}</span> : null}
          </span>
          {!collapsed ? (
            <IconChevronDown size={14} stroke={1.5} className="shrink-0 text-ink-muted" />
          ) : null}
        </span>
      }
    />
  );
}
