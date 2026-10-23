"use client";

import { useTranslations } from "next-intl";
import { CircleCheckIcon, HardHatIcon, KeyRoundIcon, TabletIcon, UserRoundIcon, UsersIcon, VenetianMaskIcon } from "lucide-react";
import { EntityIcon } from "@/components/shell/entity-icon";
import { ModuleNav, ModuleNavHeader, type ModuleNavItem } from "@/components/shell/module-nav";

const BASE = "/explore/collaborators";

/** Menu du module Collaborateurs et tablettes (spec 00 §3.2.3) ; items masqués selon les droits ; API (V1 / V2) réservé ASF. */
export function CollaboratorsMenu({ access }: {
  access: { users: boolean; operators: boolean; externalUsers: boolean; tablets: boolean; authorizedDevices: boolean; api?: boolean };
}) {
  const t = useTranslations("collaborators.menu");
  const ta = useTranslations("apiAccess.menu");
  const items: ModuleNavItem[] = [
    ...(access.users ? [{ href: `${BASE}/users`, label: t("users"), icon: UserRoundIcon }] : []),
    ...(access.operators ? [{ href: `${BASE}/operators`, label: t("operators"), icon: HardHatIcon }] : []),
    ...(access.externalUsers ? [{ href: `${BASE}/external-users`, label: t("externalUsers"), icon: VenetianMaskIcon }] : []),
    ...(access.tablets ? [{ href: `${BASE}/tablets`, label: t("tablets"), icon: TabletIcon }] : []),
    ...(access.authorizedDevices ? [{ href: `${BASE}/authorized-devices`, label: t("authorizedDevices"), icon: CircleCheckIcon }] : []),
    ...(access.api ? [{
      href: `${BASE}/external-api/v2`, match: `${BASE}/external-api`, label: ta("api"), icon: KeyRoundIcon, children: [
        { href: `${BASE}/external-api/v1`, label: ta("v1"), icon: KeyRoundIcon },
        { href: `${BASE}/external-api/v2`, label: ta("v2"), icon: KeyRoundIcon },
      ],
    }] : []),
  ];
  return (
    <ModuleNav
      header={<ModuleNavHeader icon={<EntityIcon kind="contributors" icon={UsersIcon} />} title={t("title")} />}
      groups={[{ items }]}
    />
  );
}
