"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, ChevronUpIcon, CircleCheckBigIcon, HistoryIcon, InfoIcon, PencilIcon, RotateCcwIcon, SettingsIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { PageHeader } from "@/components/shell/page-header";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { resetFlow } from "../actions";
import { FlowTypeBadge } from "../components/flow-type-badge";
import type { FlowType } from "../meta";
import { InternalValidationDialog } from "./internal-validation-dialog";
import { contentError } from "./errors";

type BannerFlow = {
  id: string; name: string; ref_int: string | null; flow_type: FlowType; description: string | null;
  location_local: string | null; functional_marker: string | null;
  status: { name: string; color: string } | null;
  family: { short_name: string; long_name: string | null; color: string } | null;
};

/** Bandeau du flow + onglets Contenu / Séquencement + menu Options (§4.1, §2.7). */
export function FlowBanner({ project, flow, permissions }: {
  project: { id: string; designation: string }; flow: BannerFlow;
  permissions: { editFlow: boolean; validation: boolean; reset: boolean };
}) {
  const t = useTranslations("flowContent");
  const tf = useTranslations("flows");
  const tp = useTranslations("projects");
  const tg = useTranslations("global");
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useDialog();
  const [expanded, setExpanded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [validation, setValidation] = useState(false);
  const base = `/explore/projects/${project.id}/flow/${flow.id}`;
  const tabs = [
    { href: `${base}/content-view`, label: t("tabs.content") },
    { href: `${base}/sequence-view`, label: t("tabs.sequence") },
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: tp("crumb"), href: "/explore/projects" },
          { label: project.designation, href: `/explore/projects/${project.id}/dashboard` },
          { label: tf("crumbView", { view: tf("views.list") }), href: `/explore/projects/${project.id}/dashboard/flow-management/vue-list` },
          { label: flow.name },
        ]}
      />
      <div className="mb-3 flex flex-col gap-2 rounded-md border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <FlowTypeBadge type={flow.flow_type} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-medium">{flow.name}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {flow.ref_int && <span>{flow.ref_int}</span>}
              <StatusBadge color={flow.status?.color} label={flow.status?.name} />
              {flow.family && <FamilyChip color={flow.family.color} shortName={flow.family.short_name} longName={flow.family.long_name} />}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={expanded ? t("banner.collapse") : t("banner.expand")} onClick={() => setExpanded((e) => !e)}>
            {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary"><SettingsIcon data-icon="inline-start" />{t("options.title")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {permissions.editFlow && <DropdownMenuItem onSelect={() => dialog.open(`flow/edit/${flow.id}/general-tab`)}><PencilIcon />{t("options.editFlow")}</DropdownMenuItem>}
                {permissions.validation && <DropdownMenuItem onSelect={() => setValidation(true)}><CircleCheckBigIcon />{t("options.internValidation")}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => dialog.open(`flow/history/${flow.id}`)}><HistoryIcon />{t("options.viewHistory")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => dialog.open(`flow/properties/${flow.id}`)}><InfoIcon />{t("options.flowSourceInfo")}</DropdownMenuItem>
              </DropdownMenuGroup>
              {permissions.reset && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmReset(true)}><RotateCcwIcon />{t("options.resetFlow")}</DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {expanded && (
          <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{tf("dialog.description")}</dt>
            <dt className="text-muted-foreground">{tf("dialog.local")}</dt>
            <dt className="text-muted-foreground">{tf("dialog.functionalMarker")}</dt>
            <dd>{flow.description || "—"}</dd><dd>{flow.location_local || "—"}</dd><dd>{flow.functional_marker || "—"}</dd>
          </dl>
        )}
        <nav className="-mb-3 flex gap-6">
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href}
              className={cn("-mb-px border-b-2 py-2 text-sm font-medium",
                pathname.startsWith(tab.href) ? "border-primary text-primary" : "border-transparent text-tab-inactive hover:text-primary")}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {validation && <InternalValidationDialog flowId={flow.id} onClose={() => setValidation(false)} />}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("reset.title")}
        description={t("reset.subtitle")}
        word="REINITIALISER"
        confirmLabel={tg("actions.reset")}
        onConfirm={async () => {
          const res = await resetFlow(flow.id);
          if (!res.ok) { notify.error(contentError(t, tg, res.error, "reset")); return; }
          notify.success(t("reset.success"));
          router.replace(`${base}/content-view`);
          router.refresh();
        }}
      />
    </>
  );
}
