import { Fragment, type ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectDetail } from "@/features/projects/queries";
import type { CustomField, CustomFieldValues } from "@/lib/custom-fields/server";

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[14rem_1fr] gap-x-6 gap-y-3 text-sm">
      {rows.map(([k, v], i) => (
        <Fragment key={`${k}-${i}`}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-words whitespace-pre-line">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border bg-card p-5">
      <h2 className="text-sm font-semibold text-table-head uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** Module « Informations » d'une entité (spec 01 §5.9) — lecture seule. */
export async function InformationView({ project, fields, values, typeLabel }: {
  project: ProjectDetail; fields: CustomField[]; values: CustomFieldValues; typeLabel: string;
}) {
  const t = await getTranslations("dashboard.information");
  const tg = await getTranslations("global");
  const format = await getFormatter();
  const p = project;
  const date = (d: string | null) => (d ? format.dateTime(new Date(d), { dateStyle: "short" }) : null);

  const contract: [string, ReactNode][] = ([
    ["contractRef", p.contract_ref], ["internalCommand", p.internal_command], ["externalCommand", p.external_command],
    ["marketNumber", p.market_number], ["technicalDeal", p.technical_deal], ["keywords", p.keywords],
    ["businessDomain", p.business_domain], ["nationalProgram", p.national_program],
    ["complementRef1", p.complement_ref_1], ["complementRef2", p.complement_ref_2],
  ] as const).map(([k, v]) => [t(`fields.${k}`), v]);
  const hasContract = p.is_contractual && contract.some(([, v]) => !!v);

  const supervisors = (prefix: "supervision_intern_" | "supervision_", key: "internSupervisor" | "externSupervisor") =>
    [1, 2, 3].map((n) => [t(`fields.${key}`, { n }), p[`${prefix}${n}` as keyof typeof p] as string | null] as [string, ReactNode]);

  const cfValue = (f: CustomField): ReactNode => {
    const v = values[f.id];
    if (v === null || v === undefined || v === "") return null;
    if (Array.isArray(v)) return v.join(" ; ");
    if (f.type === "boolean") return v === "true" ? tg("yes") : tg("no");
    if (f.type === "date") return date(v);
    if (f.type === "datetime") return format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "short" });
    if (f.type === "link") return <a href={v} target="_blank" rel="noreferrer" className="text-info hover:underline">{f.text_display || v}</a>;
    return v;
  };

  const isPgac = p.type === "pgac";

  return (
    <Tabs defaultValue="general" className="min-h-0 flex-1 overflow-hidden">
      <TabsList>
        <TabsTrigger value="general">{t("tabs.general")}</TabsTrigger>
        <TabsTrigger value="attributes">{t("tabs.attributes")}</TabsTrigger>
        <TabsTrigger value="options">{t("tabs.options")}</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="flex flex-col gap-4 overflow-y-auto pb-4">
        <Section title={t("tabs.general")}>
          <Rows rows={[
            [t("fields.designation"), p.designation],
            [t("fields.type"), typeLabel],
            [t("fields.family"), p.family ? <FamilyChip color={p.family.color} shortName={p.family.short_name} longName={p.family.long_name} /> : null],
            [t("fields.client"), p.client?.name],
            [t("fields.status"), p.status ? <StatusBadge color={p.status.color} label={p.status.name} /> : null],
            [t("fields.reference"), p.business_ref],
            ...(isPgac ? [[t("fields.codeProject"), p.code_project] as [string, ReactNode]] : []),
            [t("fields.location"), p.location_label],
            [t("fields.description"), p.description],
            ...(p.is_sub_folder ? [[t("fields.index"), p.project_index] as [string, ReactNode]] : []),
          ]} />
        </Section>
        <Section title={t("fields.contract")}>
          {hasContract ? <Rows rows={contract} /> : <p className="text-sm text-muted-foreground">{t("noContract")}</p>}
        </Section>
      </TabsContent>
      <TabsContent value="attributes" className="overflow-y-auto pb-4">
        <Section title={t("tabs.attributes")}>
          {fields.length === 0 ? <p className="text-sm text-muted-foreground">{t("noAttributes")}</p> : (
            <Rows rows={fields.filter((f) => f.type !== "label").map((f) => [f.name, cfValue(f)])} />
          )}
        </Section>
      </TabsContent>
      <TabsContent value="options" className="flex flex-col gap-4 overflow-y-auto pb-4">
        <Section title={t("tabs.options")}>
          <Rows rows={[
            [t("fields.language1"), t(`languages.${p.export_language_1}`)],
            [t("fields.language2"), t(`languages.${p.export_language_2}`)],
            [t("fields.internSupervision"), p.is_intern_supervised ? tg("yes") : t("disabled")],
            ...(p.is_intern_supervised ? supervisors("supervision_intern_", "internSupervisor") : []),
            [t("fields.externSupervision"), p.is_supervised ? tg("yes") : t("disabled")],
            ...(p.is_supervised ? supervisors("supervision_", "externSupervisor") : []),
          ]} />
        </Section>
        {isPgac && (
          <Section title={t("pgac")}>
            <Rows rows={[
              [t("fields.codeProject"), p.code_project],
              [t("fields.pgacActivities"), p.pgac_activities.join(" ; ")],
              [t("fields.startDate"), date(p.start_date)],
              [t("fields.endDate"), date(p.end_date)],
            ]} />
          </Section>
        )}
      </TabsContent>
    </Tabs>
  );
}
