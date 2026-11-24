"use client";

import type { PublicUser } from "@kanon/core";
import { ActionMenu, type ActionMenuItem } from "@kanon/ui";
import {
  IconArrowUpRight,
  IconChevronDown,
  IconHome,
  IconLogin,
  IconLogout,
  IconUser,
  IconUserPlus,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logoutAccount } from "../lib/auth-api";

const OFFICIAL_SITE_URL = "https://kanon.hk";

export interface AccountMenuProps {
  currentUser: PublicUser;
  isDemo: boolean;
}

function buildMemberMenuItems(
  push: (href: string) => void,
  onLogout: () => void,
): ActionMenuItem[] {
  return [
    {
      id: "welcome",
      label: "查看产品落地页",
      icon: <IconHome size={14} stroke={1.5} />,
      onSelect: () => push("/welcome"),
    },
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

function buildDemoMenuItems(
  push: (href: string) => void,
  onExitDemo: () => void,
): ActionMenuItem[] {
  return [
    {
      id: "register",
      label: "注册 +86 个人账号",
      icon: <IconUserPlus size={14} stroke={1.5} />,
      onSelect: () => push("/register"),
    },
    {
      id: "login",
      label: "登录已有账号",
      icon: <IconLogin size={14} stroke={1.5} />,
      onSelect: () => push("/login"),
    },
    {
      id: "official",
      label: "访问品牌官网 kanon.hk",
      icon: <IconArrowUpRight size={14} stroke={1.5} />,
      onSelect: () => window.open(OFFICIAL_SITE_URL, "_blank", "noopener,noreferrer"),
    },
    {
      id: "exit-demo",
      label: "返回产品落地页",
      icon: <IconHome size={14} stroke={1.5} />,
      onSelect: onExitDemo,
    },
  ];
}

function DemoAccountActions({
  push,
  onSignOut,
}: {
  push: (href: string) => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/register"
        className="hidden h-9 items-center gap-1.5 rounded-control border border-accent-coral/35 bg-accent-coral-soft px-3 text-xs font-medium text-accent-coral transition-colors hover:border-accent-coral/70 md:inline-flex"
      >
        <span>体验模式 · 注册保存</span>
      </Link>
      <ActionMenu
        ariaLabel="体验模式与账号菜单"
        items={buildDemoMenuItems(push, onSignOut)}
        triggerClassName="h-9 px-2.5"
        trigger={
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-primary">
            <IconUser size={14} stroke={1.5} />
            <span className="hidden sm:inline">账号</span>
            <IconChevronDown size={13} stroke={1.5} className="text-ink-muted" />
          </span>
        }
      />
    </div>
  );
}

export function AccountMenu({ currentUser, isDemo }: AccountMenuProps) {
  const router = useRouter();

  async function handleSignOut() {
    const res = await logoutAccount();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(isDemo ? "已返回产品首页" : "已安全退出账号");
    router.push("/");
    router.refresh();
  }

  if (isDemo) {
    return <DemoAccountActions push={router.push} onSignOut={() => void handleSignOut()} />;
  }

  return (
    <ActionMenu
      ariaLabel="当前登录账号菜单"
      items={buildMemberMenuItems(router.push, () => void handleSignOut())}
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
