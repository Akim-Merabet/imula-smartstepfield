"use client";

import { useTranslations } from "next-intl";
import { BarcodeIcon, ClipboardListIcon, FileTextIcon, GroupIcon, ShoppingBasketIcon, TriangleAlertIcon, WrenchIcon } from "lucide-react";
import { EntityIcon } from "@/components/shell/entity-icon";
import { ModuleNav, ModuleNavHeader, type ModuleNavItem } from "@/components/shell/module-nav";

/** Menu Bibliothèques (spec 00 §3.2.2) ; items filtrés par droit de lecture (checkPermission). */
export function LibraryMenu({ access }: { access: Record<"risks" | "equipments" | "documents" | "forms" | "objects" | "tags", boolean> }) {
  const t = useTranslations("nav.library");
  const base = "/explore/library";
  const items: (ModuleNavItem & { key: keyof typeof access })[] = [
    { key: "risks", href: `${base}/risks`, label: t("risks"), icon: TriangleAlertIcon },
    { key: "equipments", href: `${base}/equipments`, label: t("equipments"), icon: WrenchIcon },
    { key: "documents", href: `${base}/documents`, label: t("documents"), icon: FileTextIcon },
    { key: "forms", href: `${base}/forms`, label: t("forms"), icon: ClipboardListIcon },
    { key: "objects", href: `${base}/object-management/list-vue`, match: `${base}/object-management`, label: t("objects"), icon: GroupIcon },
    { key: "tags", href: `${base}/tags`, label: t("tags"), icon: BarcodeIcon },
  ];
  return (
    <ModuleNav
      header={<ModuleNavHeader icon={<EntityIcon kind="library" icon={ShoppingBasketIcon} />} title={t("title")} />}
      groups={[{ items: items.filter((i) => access[i.key]).map(({ key: _k, ...i }) => { void _k; return i; }) }]}
    />
  );
}
