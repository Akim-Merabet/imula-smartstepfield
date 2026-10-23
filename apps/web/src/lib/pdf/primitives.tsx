/* eslint-disable jsx-a11y/alt-text -- <Image> @react-pdf : pas d'attribut alt (rendu PDF, non HTML). */
/**
 * Composants @react-pdf communs : page encadrée (en-tête / pied), page de garde, tableau de suivi
 * des indices, tableaux génériques, bandeaux, cases à cocher, cellule de signature.
 * Les numéros « n / N » sont apposés après assemblage (assemble.ts) car N inclut les annexes.
 */
import { Image, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ReactNode } from "react";
import type { PdfT } from "./i18n";
import type { PdfImage } from "./images";
import { A4, DEFAULT_MARGINS, PDF_COLORS, s, type Margins } from "./theme";

export type FrameInfo = {
  /** Titre court de l'en-tête (nom du document). */
  title: string;
  /** Références « REF-INT · REF-EXT ». */
  reference?: string | null;
  /** « Indice B - BPO ». */
  indexLabel?: string | null;
  /** Pied de page gauche (entité / client). */
  footer?: string | null;
};

/**
 * Page A4 portrait / paysage. `frame` : en-tête et pied dessinés (absents si une trame fournit le fond).
 * `margins` : marges de la trame, sinon marges par défaut.
 */
export function DocPage({ children, landscape, frame, margins, font, bookmark }: {
  children: ReactNode; landscape?: boolean; frame?: FrameInfo | null; margins?: Margins | null; font: string; bookmark?: string;
}) {
  const m = margins ?? DEFAULT_MARGINS;
  const width = landscape ? A4.height : A4.width;
  return (
    <Page size="A4" orientation={landscape ? "landscape" : "portrait"} bookmark={bookmark}
      style={{ ...s.body, fontFamily: font, paddingTop: m.top, paddingBottom: m.bottom, paddingLeft: m.left, paddingRight: m.right }}>
      {frame && (
        <View fixed style={{ position: "absolute", top: 18, left: m.left, right: m.right, flexDirection: "row", alignItems: "flex-end",
          borderBottomWidth: 0.8, borderBottomColor: PDF_COLORS.primary, paddingBottom: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: 700, color: PDF_COLORS.primary }}>{frame.title}</Text>
            {frame.reference ? <Text style={{ fontSize: 7.5, color: PDF_COLORS.muted }}>{frame.reference}</Text> : null}
          </View>
          {frame.indexLabel ? <Text style={{ fontSize: 8, color: PDF_COLORS.muted }}>{frame.indexLabel}</Text> : null}
        </View>
      )}
      {frame && (
        <View fixed style={{ position: "absolute", bottom: 16, left: m.left, right: m.right, borderTopWidth: 0.5, borderTopColor: PDF_COLORS.border,
          paddingTop: 4, width: width - m.left - m.right }}>
          <Text style={{ fontSize: 7.5, color: PDF_COLORS.faint, maxWidth: (width - m.left - m.right) * 0.7 }}>{frame.footer ?? ""}</Text>
        </View>
      )}
      {children}
    </Page>
  );
}

// ===== Tableaux ====================================================================
export type Column = { key: string; label: string; flex?: number; width?: number; align?: "left" | "center" | "right" };

/** Tableau à colonnes proportionnelles (`flex`) ou fixes (`width`) ; lignes insécables, zébrées. */
export function Table({ columns, rows, headStyle, zebra = true, emptyLabel }: {
  columns: Column[]; rows: (ReactNode | string | null | undefined)[][]; headStyle?: Style; zebra?: boolean; emptyLabel?: string;
}) {
  const cellBox = (c: Column): Style => (c.width ? { width: c.width } : { flex: c.flex ?? 1 });
  return (
    <View style={s.table}>
      <View style={s.tr} fixed={false} wrap={false}>
        {columns.map((c) => (
          <View key={c.key} style={[s.th, cellBox(c), headStyle ?? {}]}><Text style={{ textAlign: c.align ?? "left" }}>{c.label}</Text></View>
        ))}
      </View>
      {rows.length === 0 && emptyLabel ? (
        <View style={s.tr}><View style={[s.td, { flex: 1 }]}><Text style={[s.muted, s.italic]}>{emptyLabel}</Text></View></View>
      ) : null}
      {rows.map((r, ri) => (
        <View key={ri} style={[s.tr, zebra && ri % 2 ? { backgroundColor: PDF_COLORS.zebra } : {}]} wrap={false}>
          {columns.map((c, ci) => {
            const v = r[ci];
            return (
              <View key={c.key} style={[s.td, cellBox(c)]}>
                {typeof v === "string" || typeof v === "number" ? <Text style={{ textAlign: c.align ?? "left" }}>{v}</Text> : (v ?? <Text> </Text>)}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Grille libellé / valeur (2 colonnes de paires). */
export function KeyValues({ items, columns = 2 }: { items: { label: string; value?: string | null }[]; columns?: 1 | 2 }) {
  const shown = items.filter((i) => i.value !== undefined);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: PDF_COLORS.border, marginBottom: 8 }}>
      {shown.map((i, k) => (
        <View key={k} style={{ width: columns === 2 ? "50%" : "100%", flexDirection: "row", borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: PDF_COLORS.border }}>
          <Text style={{ width: "42%", backgroundColor: PDF_COLORS.headBg, padding: 4, fontSize: 8, fontWeight: 700, color: PDF_COLORS.primary }}>{i.label}</Text>
          <Text style={{ flex: 1, padding: 4, fontSize: 8.5 }}>{i.value || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

export function Band({ children }: { children: ReactNode }) {
  return <View minPresenceAhead={40}><Text style={s.band}>{children}</Text></View>;
}
export function SubBand({ children }: { children: ReactNode }) {
  return <View minPresenceAhead={30}><Text style={s.subBand}>{children}</Text></View>;
}

export function CheckBox({ checked, label, size = 8 }: { checked: boolean; label?: ReactNode; size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
      <View style={{ width: size, height: size, borderWidth: 0.8, borderColor: PDF_COLORS.ink, marginRight: 4, alignItems: "center", justifyContent: "center" }}>
        {checked ? <View style={{ width: size - 3, height: size - 3, backgroundColor: PDF_COLORS.primary }} /> : null}
      </View>
      {label !== undefined ? <Text style={{ flex: 1 }}>{label}</Text> : null}
    </View>
  );
}

/** Image de signature + identité + date ; cadre vide si non signé. */
export function SignatureCell({ image, name, sub, date, empty, height = 34 }: {
  image?: PdfImage | null; name?: string | null; sub?: string | null; date?: string | null; empty?: string | null; height?: number;
}) {
  return (
    <View style={{ minHeight: height + 14 }}>
      {image ? (
        <Image src={{ data: image.data, format: image.format }}
          style={{ height, width: Math.min(110, (image.width / image.height) * height), objectFit: "contain", marginBottom: 2 }} />
      ) : !name ? (
        <View style={{ height, borderWidth: 0.5, borderColor: PDF_COLORS.borderSoft, borderStyle: "dashed", marginBottom: 2, justifyContent: "center" }}>
          {empty ? <Text style={{ fontSize: 7, color: PDF_COLORS.faint, textAlign: "center" }}>{empty}</Text> : null}
        </View>
      ) : null}
      {name ? <Text style={{ fontSize: 7.5, fontWeight: 700 }}>{name}</Text> : null}
      {sub ? <Text style={{ fontSize: 7, color: PDF_COLORS.muted }}>{sub}</Text> : null}
      {date ? <Text style={{ fontSize: 7, color: PDF_COLORS.muted }}>{date}</Text> : null}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: Style }) {
  return <Text style={[s.small, s.italic, style ?? {}]}>{children}</Text>;
}

// ===== Page de garde ===============================================================
export type VersionRow = {
  index: string; date: string; state: string; stateColor?: string; redactor: string; checker: string; approver: string; comment: string;
};

export type CoverInfo = {
  title: string;
  typeLabel: string;
  refInt?: string | null;
  refExt?: string | null;
  index?: string | null;
  state?: { label: string; color: string } | null;
  client?: string | null;
  entity?: string | null;
  family?: string | null;
  account?: string | null;
  createdAt?: string | null;
  diffusionDate?: string | null;
  generatedAt: string;
  extra?: { label: string; value: string }[];
  logo?: PdfImage | null;
  /** Position du logo client sur la page de garde (pt, depuis le haut gauche). */
  logoBox?: { x: number; y: number; width: number; height: number } | null;
  versions: VersionRow[];
};

/** Tableau de suivi des indices (historique : indice, date, état, contributeurs, commentaire). */
export function IndexTrackingTable({ t, versions }: { t: PdfT; versions: VersionRow[] }) {
  return (
    <Table
      columns={[
        { key: "index", label: t.b("cover.index"), width: 44, align: "center" },
        { key: "date", label: t.b("cover.date"), width: 58 },
        { key: "state", label: t.b("cover.state"), width: 62 },
        { key: "redactor", label: t.b("contributors.redactor"), flex: 1 },
        { key: "checker", label: t.b("contributors.checker"), flex: 1 },
        { key: "approver", label: t.b("contributors.approver"), flex: 1 },
        { key: "comment", label: t.b("cover.comment"), flex: 1.4 },
      ]}
      emptyLabel={t("cover.noVersion")}
      rows={versions.map((v) => [
        v.index, v.date,
        <View key="st" style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 6, height: 6, backgroundColor: v.stateColor ?? PDF_COLORS.faint, marginRight: 3 }} /><Text>{v.state}</Text>
        </View>,
        v.redactor, v.checker, v.approver, v.comment,
      ])}
    />
  );
}

export function CoverPage({ t, info, font, margins, withTracking = true }: { t: PdfT; info: CoverInfo; font: string; margins?: Margins | null; withTracking?: boolean }) {
  const m = margins ?? { top: 48, bottom: 48, left: 48, right: 48 };
  const refs = [info.refInt, info.refExt].filter(Boolean).join("  ·  ");
  return (
    <Page size="A4" style={{ ...s.body, fontFamily: font, paddingTop: m.top, paddingBottom: m.bottom, paddingLeft: m.left, paddingRight: m.right }}>
      {info.logo ? (
        <Image src={{ data: info.logo.data, format: info.logo.format }}
          style={info.logoBox
            ? { position: "absolute", left: info.logoBox.x, top: info.logoBox.y, width: info.logoBox.width, height: info.logoBox.height, objectFit: "contain" }
            : { position: "absolute", right: m.right, top: m.top, width: 120, height: 60, objectFit: "contain" }} />
      ) : null}
      <View style={{ marginTop: 40 }}>
        {info.account ? <Text style={{ fontSize: 9, color: PDF_COLORS.muted, textTransform: "uppercase", letterSpacing: 1 }}>{info.account}</Text> : null}
      </View>
      <View style={{ marginTop: 120, borderLeftWidth: 4, borderLeftColor: PDF_COLORS.primary, paddingLeft: 14 }}>
        <Text style={{ fontSize: 10, color: PDF_COLORS.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{info.typeLabel}</Text>
        <Text style={{ fontSize: 24, fontWeight: 700, color: PDF_COLORS.primary, lineHeight: 1.2 }}>{info.title}</Text>
        {refs ? <Text style={{ fontSize: 11, color: PDF_COLORS.ink, marginTop: 8 }}>{refs}</Text> : null}
        {info.index ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: 700 }}>{t.b("cover.index")} {info.index}</Text>
            {info.state ? (
              <View style={{ marginLeft: 10, paddingVertical: 2, paddingHorizontal: 6, backgroundColor: info.state.color }}>
                <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: 700 }}>{info.state.label}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={{ marginTop: 50 }}>
        <KeyValues items={[
          { label: t.b("cover.client"), value: info.client ?? "" },
          { label: t.b("cover.entity"), value: info.entity ?? "" },
          { label: t.b("cover.family"), value: info.family ?? "" },
          { label: t.b("cover.refInt"), value: info.refInt ?? "" },
          { label: t.b("cover.refExt"), value: info.refExt ?? "" },
          { label: t.b("cover.createdAt"), value: info.createdAt ?? "" },
          { label: t.b("cover.diffusionDate"), value: info.diffusionDate ?? "" },
          { label: t.b("cover.generatedAt"), value: info.generatedAt },
          ...(info.extra ?? []),
        ]} />
      </View>
      {withTracking ? (
        <View style={{ marginTop: 16 }}>
          <Text style={[s.h3, { marginTop: 0 }]}>{t.b("cover.tracking")}</Text>
          <IndexTrackingTable t={t} versions={info.versions} />
        </View>
      ) : null}
    </Page>
  );
}
