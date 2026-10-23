"use client";

import { useTranslations } from "next-intl";
import { CircleUserIcon, ContactRoundIcon, LockKeyholeOpenIcon, TabletIcon } from "lucide-react";
import { EntityIcon } from "@/components/shell/entity-icon";
import { ModuleNav, ModuleNavHeader } from "@/components/shell/module-nav";

/** Menu Profil (spec 00 §3.2.5) — sans contrôle de droit. */
export function ProfileMenu({ name }: { name: string }) {
  const t = useTranslations("profile");
  const base = "/explore/profile";
  return (
    <ModuleNav
      header={<ModuleNavHeader icon={<EntityIcon kind="account" icon={CircleUserIcon} />} title={name} subtitle={t("title")} />}
      groups={[{ items: [
        { href: `${base}/user-info`, label: t("menu.info"), icon: ContactRoundIcon },
        { href: `${base}/reset-password`, label: t("menu.password"), icon: LockKeyholeOpenIcon },
        { href: `${base}/tablet`, label: t("menu.tablet"), icon: TabletIcon },
      ] }]}
    />
  );
}
