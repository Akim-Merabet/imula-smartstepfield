import { expectedNatures, natureCode, numberItems, type SignatureNature } from "@imula/flow-core";
import { useQuery } from "@powersync/react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { natureLabel } from "@/components/execution/blocks";
import { Card, Empty, formatDate } from "@/components/kit";
import type { ExecFlow } from "@/data/execution-model";
import { t } from "@/i18n/fr";
import { colors, font, spacing } from "@/theme";

type Phase = { id: string; position: number; custom_number: string | null; exclude_numbering: number; name: string; disabled: number };
type Step = Phase & { phase_id: string };
type DsiRow = Parameters<typeof expectedNatures>[0] & { step_id: string };
type Sig = { block_id: string; nature: string; state: string; name: string | null; signed_at: string | null; proxied: number; proxy_principal_name: string | null };

/** Tableau des signatures d'un flow (spec 05 §4.8) : par étape, natures attendues et état de chaque signature. */
export default function SignaturesTableScreen() {
  const { flowId } = useLocalSearchParams<{ flowId: string }>();
  const { data: flows } = useQuery<ExecFlow>("select * from flows where id = ?", [flowId]);
  const { data: phases } = useQuery<Phase>("select * from phases where flow_id = ? order by position", [flowId]);
  const { data: steps } = useQuery<Step>("select * from steps where flow_id = ? order by position", [flowId]);
  const { data: configs } = useQuery<DsiRow>(
    `select c.*, b.step_id from block_dsi_configs c join blocks b on b.id = c.block_id where b.flow_id = ? and b.type = 'dsi'`, [flowId]);
  const { data: signatures } = useQuery<Sig>(
    `select s.block_id, s.nature, s.state, coalesce(c.first_name || ' ' || c.last_name, s.first_name || ' ' || s.last_name) as name,
            s.signed_at, s.proxied, s.proxy_principal_name
       from signatures s left join collaborators c on c.id = s.signatory_id
      where s.flow_id = ? and ifnull(s.disabled, 0) = 0 order by s.created_at`, [flowId]);
  const flow = flows[0];

  const rows = useMemo(() => {
    if (!flow) return [];
    const phaseNumbers = numberItems(phases, "");
    return phases.flatMap((ph) => {
      const own = steps.filter((s) => s.phase_id === ph.id);
      const stepNumbers = numberItems(own, "");
      return own.flatMap((st) => configs.filter((c) => c.step_id === st.id).map((c) => {
        const natures = expectedNatures(c, flow);
        const items = natures.map((n) => ({ nature: n, sig: [...signatures].reverse().find((s) => s.block_id === c.block_id && s.nature === n) }));
        return { key: c.block_id, label: `${t("execution.phaseShort", { n: phaseNumbers.get(ph.id)! })} ${t("execution.stepShort", { n: stepNumbers.get(st.id)! })} — ${st.name}`, disabled: !!st.disabled || !!ph.disabled, items };
      }));
    }).filter((r) => r.items.length);
  }, [flow, phases, steps, configs, signatures]);

  const total = rows.reduce((n, r) => n + r.items.length, 0);
  const done = rows.reduce((n, r) => n + r.items.filter((i) => i.sig && (i.sig.state === "signed" || i.sig.state === "not_possible")).length, 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: t("execution.signaturesTable") }} />
      {!rows.length ? <Empty>{t("execution.signaturesTableEmpty")}</Empty> : (
        <>
          <Text style={styles.progress}>{t("execution.signaturesProgress", { done, total })}</Text>
          {rows.map((r) => (
            <Card key={r.key} muted={r.disabled}>
              <Text style={[styles.step, r.disabled && { textDecorationLine: "line-through" }]}>{r.label}</Text>
              {r.items.map(({ nature, sig }) => (
                <View key={nature} style={styles.row}>
                  <Text style={styles.code}>{natureCode(nature as SignatureNature)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.text}>{natureLabel(nature as SignatureNature)}</Text>
                    <Text style={[styles.muted, sig?.state === "signed" && { color: colors.success }]}>
                      {!sig ? t("execution.signatureToDo")
                        : sig.state === "not_possible" ? t("execution.signatureNotApplicable")
                        : sig.state === "waiting" ? t("execution.signatureWaiting")
                        : sig.proxied ? t("execution.signedFor", { name: sig.name ?? "", principal: sig.proxy_principal_name ?? "" })
                        : t("execution.signedBy", { name: sig.name ?? "", date: formatDate(sig.signed_at, true) ?? "" })}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  progress: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary },
  step: { fontSize: font.body, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  code: { width: 28, fontSize: 11, fontWeight: "700", color: colors.primary, paddingTop: 2 },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
});
