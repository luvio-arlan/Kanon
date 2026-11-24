"use client";

import type { PublicUser } from "@kanon/core";
import { ActionMenu, type ActionMenuItem } from "@kanon/ui";
import { IconArrowUpRight, IconChevronDown, IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logoutAccount } from "../lib/auth-api";

const OFFICIAL_SITE_URL = "https://kanon.hk";

export interface AccountMenuProps {
  currentUser: PublicUser;
}

function buildMemberMenuItems(onLogout: () => void): ActionMenuItem[] {
  return [
    {
      id: "official",
      label: "访问品牌官网 kanon.hk",
      icon: <IconArrowUpRight size={14} stroke={1.5} />,
      onSelect: () => window.open(OFFICIAL_SITE_URL, "_blank", "noopener,noreferrer"),
    },
    {
      id: "logout",
      label: "退出当前账号",
      tone: "danger",
      icon: <IconLogout size={14} stroke={1.5} />,
      onSelect: onLogout,
    },
  ];
}

export function AccountMenu({ currentUser }: AccountMenuProps) {
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
      items={buildMemberMenuItems(() => void handleSignOut())}
      triggerClassName="h-9 px-2.5"
      trigger={
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-primary">
          <span className="flex h-5 w-5 items-center justify-center rounded-pill bg-titanium text-xs font-semibold text-ink-primary">
            {currentUser.displayName.slice(0, 1)}
          </span>
          <span className="hidden max-w-[96px] truncate sm:inline">{currentUser.displayName}</span>
          <IconChevronDown size={13} stroke={1.5} className="text-ink-muted" />
        </span>
      }
    />
  );
}
