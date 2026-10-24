"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpenIcon, CircleUserIcon, LogOutIcon, QrCodeIcon, UserIcon } from "lucide-react";
import { logout } from "@/app/(auth)/auth/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { APP_NAME, APP_VERSION } from "@/lib/app-config";
import { EntityIcon } from "./entity-icon";

export function AccountMenu({ user }: { user: { id: string; name: string; company: string | null } }) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const itemClass = "flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-muted";

  return (
    <Popover>
      <PopoverTrigger aria-label={t("rail.account")} className="flex h-[38px] w-[53px] items-center justify-center rounded hover:bg-rail-hover">
        <CircleUserIcon className="size-5" />
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64 p-2">
        <div className="flex items-center gap-3 p-2">
          <EntityIcon kind="account" icon={CircleUserIcon} size="md" />
          <div className="min-w-0">
            <div className="truncate font-medium">{user.name}</div>
            {user.company && <div className="truncate text-xs text-muted-foreground">{user.company}</div>}
          </div>
        </div>
        <Separator className="my-1" />
        <Link href="/explore/profile/user-info" className={itemClass}><UserIcon className="size-4" />{t("account.profile")}</Link>
        <Link href={`?dialog=quick-connection/user/${user.id}`} className={itemClass}><QrCodeIcon className="size-4" />{t("account.quickConnection")}</Link>
        <Link href="/explore/help" className={itemClass}><BookOpenIcon className="size-4" />{t("account.help")}</Link>
        <Separator className="my-1" />
        <div className="px-2 py-1 text-xs text-muted-foreground">{t("account.version", { app: APP_NAME, version: APP_VERSION })}</div>
        <Separator className="my-1" />
        <form action={logout}>
          <button type="submit" className={itemClass}><LogOutIcon className="size-4" />{tAuth("logout")}</button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
