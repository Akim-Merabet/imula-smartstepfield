import { useQuery } from "@powersync/react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Card, Empty, Field, formatDate, Segmented } from "@/components/kit";
import { customFieldText } from "@/data/custom-fields";
import { t } from "@/i18n/fr";
import { spacing } from "@/theme";

type Segment = "general" | "contracts" | "attributes" | "options";

type ProjectRow = {
  designation: string; type: string; project_index: string | null; location_label: string | null; description: string | null;
  start_date: string | null; end_date: string | null; contract_ref: string | null; business_ref: string | null;
  internal_command: string | null; external_command: string | null; market_number: string | null; technical_deal: string | null;
  keywords: string | null; business_domain: string | null; national_program: string | null;
  supervision_intern_1: string | null; supervision_intern_2: string | null; supervision_intern_3: string | null;
  supervision_1: string | null; supervision_2: string | null; supervision_3: string | null;
  client_name: string | null; family_name: string | null; status_name: string | null;
};

/** Fiche entité (spec 05 §2.2) : Général, Contrats, Attributs, Options. */
export default function ProjectInfoScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [segment, setSegment] = useState<Segment>("general");
  const { data } = useQuery<ProjectRow>(
    `select p.*, c.name as client_name, f.short_name as family_name, s.name as status_name
       from projects p left join clients c on c.id = p.client_id left join label_families f on f.id = p.family_id
       left join custom_statuses s on s.id = p.custom_status_id where p.id = ?`, [projectId]);
  const { data: attributes } = useQuery<{ name: string; type: string; value_text: string | null; value_json: string | null }>(
    `select cf.name, cf.type, v.value_text, v.value_json from custom_field_values v
       join custom_fields cf on cf.id = v.custom_field_id where v.object_id = ? order by cf.sort_order`, [projectId]);
  const p = data[0];
  const i = (k: string, params?: Record<string, number>) => t(`projects.info.${k}` as never, params);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: i("title") }} />
      <Segmented<Segment> value={segment} onChange={setSegment} options={[
        { value: "general", label: i("general") },
        { value: "contracts", label: i("contracts") },
        { value: "attributes", label: i("attributes") },
        { value: "options", label: i("options") },
      ]} />
      {!p ? null : segment === "general" ? (
        <Card>
          <Field label={i("name")} value={p.designation} />
          <Field label={t("projects.client")} value={p.client_name} />
          <Field label={i("family")} value={p.family_name} />
          <Field label={i("chrono")} value={p.project_index} />
          <Field label={i("location")} value={p.location_label} />
          <Field label={i("description")} value={p.description} />
          <Field label={i("status")} value={p.status_name} />
          <Field label={i("plannedDates")} value={[formatDate(p.start_date), formatDate(p.end_date)].filter(Boolean).join(" → ")} />
        </Card>
      ) : segment === "contracts" ? (
        <Card>
          <Field label={i("contractNumber")} value={p.contract_ref} />
          <Field label={i("reference")} value={p.business_ref} />
          <Field label={i("internalOrderNumber")} value={p.internal_command} />
          <Field label={i("externalOrderNumber")} value={p.external_command} />
          <Field label={i("marketNumber")} value={p.market_number} />
          <Field label={i("technicalCase")} value={p.technical_deal} />
          <Field label={i("keywords")} value={p.keywords} />
          <Field label={i("businessDomain")} value={p.business_domain} />
          <Field label={i("nationalProgram")} value={p.national_program} />
        </Card>
      ) : segment === "attributes" ? (
        attributes.length ? (
          <Card>{attributes.map((a) => <Field key={a.name} label={a.name} value={customFieldText(a)} />)}</Card>
        ) : <Empty>{t("common.emptyContent")}</Empty>
      ) : (
        <Card>
          {([1, 2, 3] as const).map((n) => <Field key={`i${n}`} label={i("internalSupervisor", { n })} value={p[`supervision_intern_${n}`]} />)}
          {([1, 2, 3] as const).map((n) => <Field key={`e${n}`} label={i("externalSupervisor", { n })} value={p[`supervision_${n}`]} />)}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
});
