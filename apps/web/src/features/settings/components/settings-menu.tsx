"use client";

import { useTranslations } from "next-intl";
import {
  ArchiveIcon, ArrowLeftRightIcon, BookUserIcon, Building2Icon, BuildingIcon, ChartColumnIcon, DatabaseIcon, FileCodeIcon,
  FileSignatureIcon, FlagIcon, Grid3x3Icon, LoaderIcon, SettingsIcon, SlidersHorizontalIcon, StickyNoteIcon, TagIcon, TagsIcon,
  ToolboxIcon, Trash2Icon, WorkflowIcon,
} from "lucide-react";
import { EntityIcon } from "@/components/shell/entity-icon";
import { ModuleNav, ModuleNavHeader, type ModuleNavGroup, type ModuleNavItem } from "@/components/shell/module-nav";

export type SettingsAccess = Record<
  | "account" | "clients" | "companies" | "families" | "categories" | "statuses" | "references" | "customFields"
  | "filesModels" | "filesCells" | "sections" | "backgroundTasks" | "platform", boolean>;

const BASE = "/explore/settings";

/** Menu latéral du module Paramètres (spec 00 §3.2.4) ; items masqués selon les droits. */
export function SettingsMenu({ access }: { access: SettingsAccess }) {
  const t = useTranslations("settings.menu");
  const item = (show: boolean, entry: ModuleNavItem): ModuleNavItem[] => (show ? [entry] : []);

  const files: ModuleNavItem[] = [
    ...item(access.filesModels, { href: `${BASE}/files-models`, label: t("filesModels"), icon: StickyNoteIcon }),
    ...item(access.filesCells, { href: `${BASE}/files-cells`, label: t("filesCells"), icon: Grid3x3Icon }),
  ];

  const main: ModuleNavItem[] = [
    ...item(access.account, { href: `${BASE}/account`, label: t("account"), icon: Building2Icon }),
    ...item(access.clients, { href: `${BASE}/clients`, label: t("clients"), icon: BookUserIcon }),
    ...item(access.companies, { href: `${BASE}/companies`, label: t("companies"), icon: ArrowLeftRightIcon }),
    ...item(access.families, { href: `${BASE}/families`, label: t("families"), icon: TagIcon }),
    ...item(access.categories, { href: `${BASE}/categories`, label: t("categories"), icon: TagsIcon }),
    ...item(access.statuses, { href: `${BASE}/statuses?type=flow`, match: `${BASE}/statuses`, label: t("statuses"), icon: FlagIcon }),
    ...item(access.references, { href: `${BASE}/references`, label: t("references"), icon: ToolboxIcon }),
    ...item(access.customFields, { href: `${BASE}/custom-fields?type=project`, match: `${BASE}/custom-fields`, label: t("customFields"), icon: WorkflowIcon }),
    ...(files.length ? [{ href: files[0].href, match: `${BASE}/files-`, label: t("files"), icon: FileCodeIcon, children: files }] : []),
    ...item(access.sections, { href: `${BASE}/sections`, label: t("sections"), icon: ArchiveIcon }),
    { href: `${BASE}/trash`, label: t("trash"), icon: Trash2Icon },
    ...item(access.backgroundTasks, { href: `${BASE}/background-tasks`, label: t("backgroundTasks"), icon: LoaderIcon }),
  ];

  const groups: ModuleNavGroup[] = [{ items: main }];
  if (access.platform) {
    groups.push({
      label: t("platform"),
      items: [
        {
          href: `${BASE}/general-account`, match: `${BASE}/general-`, label: t("general"), icon: SlidersHorizontalIcon,
          children: [
            { href: `${BASE}/general-account`, label: t("generalAccount"), icon: BuildingIcon },
            { href: `${BASE}/general-organization`, label: t("generalOrganization"), icon: Grid3x3Icon },
          ],
        },
        { href: `${BASE}/trams`, label: t("trams"), icon: FileCodeIcon },
        { href: `${BASE}/wording-configuration`, label: t("wording"), icon: FileSignatureIcon },
        { href: `${BASE}/backups`, label: t("backups"), icon: DatabaseIcon },
        { href: `${BASE}/logs-push`, label: t("logsPush"), icon: DatabaseIcon },
        { href: `${BASE}/kpi`, label: t("usage"), icon: ChartColumnIcon },
      ],
    });
  }

  return (
    <ModuleNav
      header={<ModuleNavHeader icon={<EntityIcon kind="settings" icon={SettingsIcon} />} title={t("title")} />}
      groups={groups}
    />
  );
}
