"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderOpenIcon, PlusIcon, SettingsIcon, ShoppingBasketIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/app-config";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { EventsBell } from "./events-bell";
import { usePageAdd } from "./page-actions";

type RailItem = { href: string; label: string; icon: LucideIcon; match: string };

function RailLink({ item, active }: { item: RailItem; active: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-label={item.label}
          className={cn(
            "flex h-[38px] w-[53px] items-center justify-center rounded transition-colors duration-100 hover:bg-rail-hover",
            active && "bg-rail-hover",
          )}
        >
          <item.icon className="size-5" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function NavRail({ access, user }: {
  access: { library: boolean; contributors: boolean; settings: boolean };
  user: { id: string; name: string; company: string | null };
}) {
  const t = useTranslations("nav.rail");
  const pathname = usePathname();
  const onAdd = usePageAdd();

  const main: RailItem[] = [
    { href: "/explore/projects", label: t("entities"), icon: FolderOpenIcon, match: "/explore/projects" },
    ...(access.library ? [{ href: "/explore/library/forms", label: t("library"), icon: ShoppingBasketIcon, match: "/explore/library" }] : []),
    ...(access.contributors ? [{ href: "/explore/collaborators/users", label: t("contributors"), icon: UsersIcon, match: "/explore/collaborators" }] : []),
  ];
  const settings: RailItem = { href: "/explore/settings/account", label: t("settings"), icon: SettingsIcon, match: "/explore/settings" };

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-2 bg-rail px-2 py-4 text-rail-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/explore/projects" aria-label={t("home")} className="mb-1 flex size-10 items-center justify-center rounded-md bg-white/15 text-lg font-bold">
            {APP_NAME.slice(0, 1)}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{t("home")}</TooltipContent>
      </Tooltip>
      {onAdd && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onAdd} aria-label={t("add")} className="flex h-[38px] w-[53px] items-center justify-center rounded hover:bg-rail-hover">
              <PlusIcon className="size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("add")}</TooltipContent>
        </Tooltip>
      )}
      <div className="my-1 h-0.5 w-8 bg-white" />
      {main.map((item) => (
        <RailLink key={item.href} item={item} active={pathname.startsWith(item.match) || (item.match === "/explore/projects" && pathname.startsWith("/explore/folder"))} />
      ))}
      <div className="mt-auto flex flex-col items-center gap-2">
        <EventsBell />
        {access.settings && <RailLink item={settings} active={pathname.startsWith(settings.match)} />}
        <AccountMenu user={user} />
      </div>
    </nav>
  );
}
