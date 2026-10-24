// Saisie d'une question de formulaire sur le terrain (spec 05 §4.7.3) ; formats de valeur de @imula/forms-core.
import type { RtCell, RtQuestion } from "@imula/forms-core/model";
import { WEBAPP_ONLY } from "@imula/forms-core/meta";
import { cellError, checkValidation, isFilled, type ValuesMap } from "@imula/forms-core/values";
import * as Location from "expo-location";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { FormSignature } from "@/components/forms/form-signature";
import { PhotoField } from "@/components/forms/photo-field";
import { Icon } from "@/components/kit";
import { t } from "@/i18n/fr";
import { colors, font, radius, spacing } from "@/theme";

export type QuestionProps = {
  question: RtQuestion;
  responseId: string;
  values: ValuesMap;
  readOnly: boolean;
  createdAt: string;
  observation: string;
  error?: "mandatory" | "invalid" | null;
  highlight?: boolean;
  /** En-tête de cellule (tableaux). */
  header?: (cell: RtCell, index: number) => string | undefined;
  onChange: (lineageId: string, value: unknown) => void;
  onExclusive: (question: RtQuestion, lineageId: string, checked: boolean) => void;
  onObservation: (text: string) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** AAAA-MM-JJ ↔ JJ/MM/AAAA */
const isoToDay = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : "");
const dayToIso = (d: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d.trim());
  if (!m) return null;
  const date = new Date(+m[3], +m[2] - 1, +m[1]);
  return date.getDate() === +m[1] && date.getMonth() === +m[2] - 1 ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null;
};
const parseNumber = (s: string): number | null => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return s.trim() === "" || Number.isNaN(n) ? null : n;
};
const formatNumber = (n: unknown) => (typeof n === "number" ? String(n).replace(".", ",") : "");

export function QuestionInput(p: QuestionProps) {
  const { question: q } = p;
  const showObservation = q.def.withObservation;
  return (
    <View style={[styles.question, p.highlight && styles.highlight, p.error && styles.errorBorder]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{q.name}{q.def.mandatory ? " *" : ""}</Text>
        {p.error && <Text style={styles.errorTag}>{p.error === "mandatory" ? t("forms.mandatory") : t("forms.invalid")}</Text>}
      </View>
      {!!q.def.description && <Text style={styles.description}>{q.def.description}</Text>}
      {WEBAPP_ONLY.has(q.type) ? <Text style={styles.muted}>{t("forms.webappOnly")}</Text>
        : q.cells.map((cell, i) => <CellInput key={cell.lineageId} {...p} cell={cell} index={i} />)}
      {showObservation && (
        <TextInput value={p.observation} onChangeText={p.onObservation} editable={!p.readOnly} multiline
          placeholder={t("forms.observationPlaceholder")} placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t("forms.observation")} style={[styles.input, styles.multiline]} />
      )}
    </View>
  );
}

function CellInput(p: QuestionProps & { cell: RtCell; index: number }) {
  const { question: q, cell } = p;
  const stored = p.values[cell.lineageId];
  const value = stored?.value ?? null;
  const locked = !!stored?.locked;
  const disabled = p.readOnly || locked || !!cell.opt?.frozen;
  const set = (v: unknown) => p.onChange(cell.lineageId, v);
  const label = p.header?.(cell, p.index) ?? cell.opt?.optionName ?? cell.opt?.name;
  const validation = cell.opt?.validation;
  const outOfRange = isFilled(q.type, value, cell) && validation && !checkValidation(q.type, value, validation);
  const invalid = cellError(q, cell, value, p.createdAt);
  const alert = cell.opt?.alert && isFilled(q.type, value, cell) && outOfRange ? cell.opt.alert.text : null;

  let input: React.ReactNode;
  switch (q.type) {
    case "short_answer": case "multiple_answers": case "long_answer":
      input = (
        <TextInput value={typeof value === "string" ? value : ""} onChangeText={(v) => set(v === "" ? null : v)} editable={!disabled}
          multiline={q.type === "long_answer"} placeholder={cell.opt?.placeholder} placeholderTextColor={colors.textSecondary}
          accessibilityLabel={label ?? q.name} style={[styles.input, q.type === "long_answer" && styles.multiline]} />
      );
      break;
    case "unique_choice": case "multiple_choices": {
      const checked = value === true;
      const radio = q.type === "unique_choice";
      input = (
        <Pressable accessibilityRole={radio ? "radio" : "checkbox"} accessibilityState={{ checked, disabled }} disabled={disabled}
          onPress={() => (radio ? p.onExclusive(q, cell.lineageId, !checked) : set(checked ? null : true))} style={styles.choice}>
          <Icon name={radio ? (checked ? "radiobox-marked" : "radiobox-blank") : (checked ? "checkbox-marked" : "checkbox-blank-outline")}
            color={checked ? colors.primary : colors.textSecondary} />
          <Text style={styles.text}>{cell.opt?.name ?? label ?? ""}</Text>
        </Pressable>
      );
      break;
    }
    case "single_choice_list": case "multiple_choice_list": {
      const multi = q.type === "multiple_choice_list";
      const selected: string[] = multi ? (Array.isArray(value) ? value as string[] : []) : (typeof value === "string" ? [value] : []);
      input = (
        <View style={styles.chips}>
          {(cell.opt?.choices ?? []).map((c) => {
            const on = selected.includes(c);
            return (
              <Pressable key={c} disabled={disabled} accessibilityRole={multi ? "checkbox" : "radio"} accessibilityState={{ checked: on }}
                onPress={() => {
                  if (!multi) return set(on ? null : c);
                  const next = on ? selected.filter((x) => x !== c) : [...selected, c];
                  set(next.length ? next : null);
                }}
                style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipLabel, on && { color: colors.onPrimary }]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
      );
      break;
    }
    case "date":
      input = <DateField value={typeof value === "string" ? value : null} disabled={disabled} withTime={false} onChange={set} label={label ?? q.name} />;
      break;
    case "datetime":
      input = <DateField value={typeof value === "string" ? value : null} disabled={disabled} withTime onChange={set} label={label ?? q.name} />;
      break;
    case "duration": {
      const d = (value ?? {}) as { hours?: number | null; minutes?: number | null };
      const update = (k: "hours" | "minutes", s: string) => {
        const n = parseNumber(s);
        const next = { hours: d.hours ?? null, minutes: d.minutes ?? null, [k]: n === null ? null : Math.max(0, Math.trunc(n)) };
        set(next.hours === null && next.minutes === null ? null : next);
      };
      input = (
        <View style={styles.row}>
          <NumberBox label={t("forms.hours")} value={d.hours ?? null} disabled={disabled} onChange={(s) => update("hours", s)} />
          <NumberBox label={t("forms.minutes")} value={d.minutes ?? null} disabled={disabled} onChange={(s) => update("minutes", s)} />
        </View>
      );
      break;
    }
    case "value_unit": {
      const v = (value ?? {}) as { value?: number | null };
      input = (
        <View style={styles.row}>
          <NumberBox label={label ?? q.name} value={v.value ?? null} disabled={disabled}
            onChange={(s) => { const n = parseNumber(s); set(n === null ? null : { value: n, unit: cell.opt?.unit }); }} />
          {!!cell.opt?.unit && <Text style={styles.unit}>{cell.opt.unit}</Text>}
        </View>
      );
      break;
    }
    case "photo":
      input = <PhotoField value={Array.isArray(value) ? value : null} onChange={set} disabled={disabled} responseId={p.responseId} />;
      break;
    case "collaborator":
      input = cell.slot
        ? <FormSignature slot={cell.slot} value={(value as never) ?? null} onChange={set} disabled={disabled} responseId={p.responseId} />
        : null;
      break;
    case "location":
      input = <LocationField value={value as { lat?: number; lng?: number } | null} disabled={disabled} onChange={set} />;
      break;
    case "formula": {
      const r = (value as { result?: unknown } | null)?.result;
      input = (
        <Text style={styles.formula}>
          {r === null || r === undefined ? t("forms.formulaPending") : `${typeof r === "number" ? formatNumber(r) : String(r)} ${cell.opt?.unit ?? ""}`}
        </Text>
      );
      break;
    }
    default:
      input = <Text style={styles.muted}>{t("forms.unavailable")}</Text>;
  }

  return (
    <View style={styles.cell}>
      {!!label && !["unique_choice", "multiple_choices", "collaborator"].includes(q.type) && q.cells.length > 1 && <Text style={styles.cellLabel}>{label}</Text>}
      {input}
      {locked && <Text style={styles.muted}>{t("forms.lockedValue")}</Text>}
      {!!invalid && <Text style={styles.error}>{q.type === "date" || q.type === "datetime" ? t("forms.backdating") : t("forms.outOfRange")}</Text>}
      {!invalid && outOfRange && <Text style={styles.warning}>{validation?.message || t("forms.outOfRange")}</Text>}
      {!!alert && <Text style={styles.warning}>{alert}</Text>}
    </View>
  );
}

function NumberBox({ label, value, disabled, onChange }: { label: string; value: number | null; disabled: boolean; onChange: (s: string) => void }) {
  // Saisie libre (virgule, signe) : le texte est gardé tel quel pendant la frappe.
  const [text, setText] = useState(formatNumber(value));
  return (
    <TextInput value={text} editable={!disabled} keyboardType="decimal-pad" accessibilityLabel={label} placeholder={label}
      placeholderTextColor={colors.textSecondary} style={[styles.input, { flex: 1 }]}
      onChangeText={(s) => { setText(s); onChange(s); }} />
  );
}

function DateField({ value, withTime, disabled, onChange, label }: {
  value: string | null; withTime: boolean; disabled: boolean; onChange: (v: string | null) => void; label: string;
}) {
  const initial = value ? (withTime ? new Date(value) : null) : null;
  const [day, setDay] = useState(value ? (withTime && initial ? `${pad(initial.getDate())}/${pad(initial.getMonth() + 1)}/${initial.getFullYear()}` : isoToDay(value)) : "");
  const [time, setTime] = useState(initial ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}` : "");
  const emit = (d: string, tm: string) => {
    const iso = dayToIso(d);
    if (!iso) return onChange(null);
    if (!withTime) return onChange(iso);
    const m = /^(\d{1,2}):(\d{2})$/.exec(tm.trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return onChange(null);
    const date = new Date(`${iso}T00:00:00`);
    date.setHours(+m[1], +m[2]);
    onChange(date.toISOString());
  };
  return (
    <View style={styles.row}>
      <TextInput value={day} editable={!disabled} placeholder={t("signature.dateFormat")} placeholderTextColor={colors.textSecondary}
        keyboardType="numbers-and-punctuation" accessibilityLabel={label} style={[styles.input, { flex: 3 }]}
        onChangeText={(d) => { setDay(d); emit(d, time); }} />
      {withTime && (
        <TextInput value={time} editable={!disabled} placeholder={t("signature.timeFormat")} placeholderTextColor={colors.textSecondary}
          keyboardType="numbers-and-punctuation" accessibilityLabel={t("signature.time")} style={[styles.input, { flex: 2 }]}
          onChangeText={(tm) => { setTime(tm); emit(day, tm); }} />
      )}
    </View>
  );
}

function LocationField({ value, disabled, onChange }: { value: { lat?: number; lng?: number } | null; disabled: boolean; onChange: (v: unknown) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [lat, setLat] = useState(formatNumber(value?.lat));
  const [lng, setLng] = useState(formatNumber(value?.lng));
  const emit = (a: string, b: string) => {
    const x = parseNumber(a), y = parseNumber(b);
    onChange(x === null || y === null ? null : { lat: x, lng: y });
  };
  const locate = async () => {
    setError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return setError(t("forms.locationDenied"));
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLat(formatNumber(pos.coords.latitude));
    setLng(formatNumber(pos.coords.longitude));
    onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude ?? undefined });
  };
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.row}>
        <TextInput value={lat} editable={!disabled} keyboardType="numbers-and-punctuation" placeholder={t("forms.latitude")}
          placeholderTextColor={colors.textSecondary} accessibilityLabel={t("forms.latitude")} style={[styles.input, { flex: 1 }]}
          onChangeText={(s) => { setLat(s); emit(s, lng); }} />
        <TextInput value={lng} editable={!disabled} keyboardType="numbers-and-punctuation" placeholder={t("forms.longitude")}
          placeholderTextColor={colors.textSecondary} accessibilityLabel={t("forms.longitude")} style={[styles.input, { flex: 1 }]}
          onChangeText={(s) => { setLng(s); emit(lat, s); }} />
      </View>
      {!disabled && (
        <Pressable accessibilityRole="button" onPress={locate} style={styles.locate}>
          <Icon name="crosshairs-gps" color={colors.primary} size={18} />
          <Text style={styles.locateLabel}>{t("forms.locateMe")}</Text>
        </Pressable>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  question: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: "transparent" },
  highlight: { borderColor: colors.primary },
  errorBorder: { borderColor: colors.danger },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: font.body, fontWeight: "700", color: colors.text },
  errorTag: { fontSize: 11, fontWeight: "700", color: colors.danger },
  description: { fontSize: font.small, color: colors.textSecondary },
  cell: { gap: spacing.xs },
  cellLabel: { fontSize: font.small, fontWeight: "600", color: colors.textSecondary },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, fontSize: font.body, color: colors.text, backgroundColor: colors.surface },
  multiline: { minHeight: 80, textAlignVertical: "top", paddingVertical: spacing.sm },
  choice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { fontSize: font.small, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  unit: { fontSize: font.body, color: colors.textSecondary },
  formula: { fontSize: font.body, color: colors.text, fontWeight: "600" },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
  error: { fontSize: font.small, color: colors.danger },
  warning: { fontSize: font.small, color: colors.warning },
  locate: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", padding: spacing.xs },
  locateLabel: { color: colors.primary, fontWeight: "600", fontSize: font.small },
});
