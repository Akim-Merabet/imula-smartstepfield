"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon, BracesIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardListIcon, EyeIcon, FileTextIcon, PencilIcon, PlusIcon, UploadCloudIcon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { NATURE_LETTER } from "../meta";
import { publishFormVersion } from "./actions";
import { BuilderProvider, useBuilder } from "./builder-context";
import { BuilderMenu } from "./builder-menu";
import { rubricsOf } from "./model";
import { RubricPreview } from "./preview";
import type { BuilderData } from "./queries";
import { AddRubricMenu, RubricEditor } from "./rubric-editor";
import { VariablesDialog } from "./variables-dialog";

export function FormBuilder({ data, returnTo, viewMode }: { data: BuilderData; returnTo: string; viewMode: boolean }) {
  return (
    <BuilderProvider data={data} editable={data.canEdit && !viewMode}>
      <BuilderShell returnTo={returnTo} viewMode={viewMode || !data.canEdit} />
    </BuilderProvider>
  );
}

function BuilderShell({ returnTo, viewMode }: { returnTo: string; viewMode: boolean }) {
  const t = useTranslations("formBuilder");
  const tf = useTranslations("formBuilder.header");
  const tPdf = useTranslations("pdf.ui");
  const { data, s, run, formId, editable } = useBuilder();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rubrics = useMemo(() => rubricsOf(s), [s]);
  const [selected, setCurrent] = useState<string | null>(searchParams.get("rubric") ?? rubrics[0]?.id ?? null);
  const [vars, setVars] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const current = selected && rubrics.some((r) => r.id === selected) ? selected : rubrics[0]?.id ?? null;

  const index = rubrics.findIndex((r) => r.id === current);
  const rubric = index >= 0 ? rubrics[index] : null;

  const navigate = (rubricId: string, questionId?: string) => {
    setCurrent(rubricId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("rubric", rubricId);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    if (questionId) setTimeout(() => document.getElementById(`q-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    else document.getElementById("builder-main")?.scrollTo({ top: 0 });
  };

  const switchMode = () => {
    if (viewMode && !data.canEdit) { notify.error(t("mode.switchError")); return; }
    const params = new URLSearchParams(searchParams.toString());
    if (viewMode) params.delete("mode"); else params.set("mode", "view");
    if (current) params.set("rubric", current);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const published = !!data.lastVersion && data.lastVersion.structure_rev === data.form.structure_rev;
  const publish = async () => {
    setPublishing(true);
    const res = await run(() => publishFormVersion(formId));
    setPublishing(false);
    if (res.ok) notify.success(tf("published", { n: res.data.versionNo }));
  };

  return (
    <div className="flex h-screen min-w-[990px] flex-col overflow-hidden bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-2 shadow-[0_3px_6px_#00000014]">
        <Button variant="ghost" size="icon" asChild aria-label={tf("back")}>
          <Link href={returnTo}><ArrowLeftIcon /></Link>
        </Button>
        <EntityIcon kind={data.form.location === "library" ? "library" : "project"} icon={ClipboardListIcon} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-medium">{data.form.name}</h1>
            <Badge variant="outline" title={t(`natures.${data.form.nature}`)}>{NATURE_LETTER[data.form.nature]}</Badge>
            {data.family && <FamilyChip color={data.family.color} shortName={data.family.short_name} longName={data.family.long_name} />}
            {data.form.index_label && <span className="text-sm text-muted-foreground">{tf("index", { index: data.form.index_label })}</span>}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {[data.project?.designation ?? tf("library"), data.form.additional_comment].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" disabled={index <= 0} aria-label={t("header.previousRubric")}
            onClick={() => rubrics[index - 1] && navigate(rubrics[index - 1].id)}><ChevronLeftIcon /></Button>
          <span className="min-w-20 text-center text-sm text-muted-foreground">
            {rubrics.length ? tf("rubricCounter", { current: index + 1, total: rubrics.length }) : "—"}
          </span>
          <Button variant="ghost" size="icon-sm" disabled={index < 0 || index >= rubrics.length - 1} aria-label={t("header.nextRubric")}
            onClick={() => rubrics[index + 1] && navigate(rubrics[index + 1].id)}><ChevronRightIcon /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={published ? "secondary" : "outline"} className={published ? undefined : "border-warning text-warning"}>
            {published ? tf("versionPublished", { n: data.lastVersion!.version_no }) : tf("unpublished")}
          </Badge>
          {data.canEdit && !published && (
            <Button variant="outline" size="sm" disabled={publishing} onClick={publish}><UploadCloudIcon data-icon="inline-start" />{tf("publish")}</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setVars(true)}><BracesIcon data-icon="inline-start" />{tf("variables")}</Button>
          <Button variant="ghost" size="sm" asChild title={tPdf("previewBlankHelp")}>
            <a href={`/api/pdf/forms/${data.form.id}`} target="_blank" rel="noopener"><FileTextIcon data-icon="inline-start" />{tPdf("previewBlank")}</a>
          </Button>
          <Badge variant="secondary">{viewMode ? t("mode.view") : t("mode.build")}</Badge>
          <Button size="sm" onClick={switchMode}>
            {viewMode ? <PencilIcon data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}
            {viewMode ? t("mode.goToBuild") : t("mode.goToView")}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <BuilderMenu current={current} onNavigate={navigate} />
        <main id="builder-main" className="min-w-0 flex-1 overflow-y-auto bg-muted px-6 py-6">
          {!rubric ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>{t("empty.title")}</EmptyTitle>
                <EmptyDescription>{t("empty.subtitle")}</EmptyDescription>
              </EmptyHeader>
              {editable && (
                <AddRubricMenu onCreated={(id) => navigate(id)}
                  trigger={<Button><PlusIcon data-icon="inline-start" />{t("menu.addRubric")}</Button>} />
              )}
            </Empty>
          ) : viewMode ? <RubricPreview rubric={rubric} /> : <RubricEditor rubric={rubric} onSelect={(id) => (id ? navigate(id) : setCurrent(null))} />}
          {rubric && (
            <div className="mx-auto mt-6 flex max-w-5xl justify-between">
              <Button variant="outline" disabled={index <= 0} onClick={() => navigate(rubrics[index - 1].id)}>
                <ChevronLeftIcon data-icon="inline-start" />{t("header.previousRubric")}
              </Button>
              <Button variant="outline" disabled={index >= rubrics.length - 1} onClick={() => navigate(rubrics[index + 1].id)}>
                {t("header.nextRubric")}<ChevronRightIcon data-icon="inline-end" />
              </Button>
            </div>
          )}
        </main>
      </div>
      <VariablesDialog open={vars} onOpenChange={setVars} />
    </div>
  );
}
