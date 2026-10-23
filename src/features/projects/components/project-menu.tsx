"use client";

import { useTranslations } from "next-intl";
import {
  ArchiveIcon, CalendarIcon, ChartLineIcon, ClipboardListIcon, FileIcon, FileTextIcon, IdCardIcon, ListIcon, MapIcon,
  MapPinnedIcon, MessagesSquareIcon, NetworkIcon, PencilRulerIcon, SignatureIcon, TabletIcon, TagIcon, UsersRoundIcon, WorkflowIcon,
} from "lucide-react";
import { EntityIcon } from "@/components/shell/entity-icon";
import { ModuleNav, ModuleNavHeader, type ModuleNavGroup, type ModuleNavItem } from "@/components/shell/module-nav";
import type { ProjectType } from "../meta";

/** Menu latéral d'une entité ; visibilité par type d'entité (spec 00 §3.2.1). */
export function ProjectMenu({ project, diagramEnabled }: {
  project: { id: string; type: ProjectType; designation: string; typeLabel: string; letter: string };
  diagramEnabled: boolean;
}) {
  const t = useTranslations("nav.dashboard");
  const base = `/explore/projects/${project.id}/dashboard`;
  const type = project.type;
  const isTemplate = type === "template";
  const isProjectLike = type === "project" || type === "pgac";
  const isTemplateOrRef = type === "template" || type === "referential";
  const diagram = diagramEnabled && ["folder", "referential", "project", "pgac"].includes(type);

  const flowChildren: ModuleNavItem[] = [
    { href: `${base}/flow-management/vue-list`, label: t("viewList"), icon: ListIcon },
    ...(!isTemplate ? [{ href: `${base}/flow-management/vue-plan`, label: t("viewPlan"), icon: MapIcon }] : []),
    ...(!isTemplate ? [{ href: `${base}/flow-management/vue-map`, label: t("viewMap"), icon: MapPinnedIcon }] : []),
    ...(diagram ? [{ href: `${base}/flow-management/vue-diagram`, label: t("viewDiagram"), icon: WorkflowIcon }] : []),
  ];

  const main: ModuleNavItem[] = [
    { href: `${base}/flow-management/vue-list`, match: `${base}/flow-management`, label: t("flows"), icon: NetworkIcon, children: flowChildren },
    ...(!isTemplate ? [{ href: `${base}/documents`, label: t("documents"), icon: FileTextIcon }] : []),
    { href: `${base}/forms`, label: t("forms"), icon: ClipboardListIcon },
    ...(isProjectLike ? [{
      href: `${base}/flow-referential/vue-list`, match: `${base}/flow-referential`, label: t("referentials"), icon: PencilRulerIcon,
      children: [
        { href: `${base}/flow-referential/vue-list`, label: t("viewList"), icon: ListIcon },
        ...(diagram ? [{ href: `${base}/flow-referential/vue-diagram`, label: t("viewDiagram"), icon: WorkflowIcon }] : []),
      ],
    }] : []),
    ...(!isTemplate ? [{ href: `${base}/lists`, label: t("lists"), icon: FileIcon }] : []),
    ...(isProjectLike ? [{ href: `${base}/schedule-tasks`, label: t("schedule"), icon: CalendarIcon }] : []),
    { href: `${base}/collaborators`, label: t("collaborators"), icon: UsersRoundIcon },
    ...(!isTemplateOrRef ? [{ href: `${base}/tablets`, label: t("tablets"), icon: TabletIcon }] : []),
  ];

  const followUp: ModuleNavItem[] = [
    { href: `${base}/metrics`, label: t("metrics"), icon: ChartLineIcon },
    ...(!isTemplateOrRef ? [
      { href: `${base}/signatures/vue-list`, match: `${base}/signatures`, label: t("signatures"), icon: SignatureIcon },
      { href: `${base}/fields-feedback`, label: t("fieldFeedback"), icon: MessagesSquareIcon },
      { href: `${base}/closing-folder`, label: t("closingFolder"), icon: ArchiveIcon },
    ] : []),
  ];

  const groups: ModuleNavGroup[] = [
    { items: main },
    { label: t("followUp"), items: followUp },
    { label: t("configuration"), items: [
      { href: `${base}/information`, label: t("information"), icon: IdCardIcon },
      { href: `${base}/categories`, label: t("categories"), icon: TagIcon },
    ] },
  ];

  return (
    <ModuleNav
      header={<ModuleNavHeader icon={<EntityIcon kind={type} letter={project.letter} />} title={project.designation} subtitle={project.typeLabel} />}
      groups={groups}
    />
  );
}
