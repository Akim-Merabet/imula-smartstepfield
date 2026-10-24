// « Remplissage en masse » d'une question de tableau (spec 05 §4.7.3) : une valeur saisie une fois est copiée dans les
// cellules vides ; « Les champs déjà remplis ne seront pas modifiés ».
import type { RtQuestion } from "@imula/forms-core/model";
import type { ValuesMap } from "@imula/forms-core/values";
import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { QuestionInput } from "@/components/forms/question-input";
import { Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { colors, font, radius, spacing } from "@/theme";

export function BulkFillModal({ question, targets, responseId, createdAt, onApply, onClose }: {
  question: RtQuestion; targets: string[]; responseId: string; createdAt: string;
  onApply: (value: unknown) => void; onClose: () => void;
}) {
  // Question réduite à une cellule modèle (la première vide), saisie dans un état local.
  const template = question.cells.find((c) => targets.includes(c.lineageId)) ?? question.cells[0];
  const single: RtQuestion = { ...question, cells: [template] };
  const [values, setValues] = useState<ValuesMap>({});
  const value = values[template.lineageId]?.value ?? null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>{t("forms.bulkFill")}</Text>
          <Text style={styles.text}>{t("forms.bulkFillCount", { count: targets.length })}</Text>
          <Text style={styles.muted}>{t("forms.bulkFillKeep")}</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            <QuestionInput question={single} responseId={responseId} values={values} readOnly={false} createdAt={createdAt}
              observation="" onChange={(id, v) => setValues({ [id]: { value: v, locked: false } })} onExclusive={() => {}} onObservation={() => {}} />
          </ScrollView>
          <Button label={t("forms.bulkFillApply")} onPress={() => onApply(value)} disabled={value === null} />
          <Button label={t("common.cancel")} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
});
