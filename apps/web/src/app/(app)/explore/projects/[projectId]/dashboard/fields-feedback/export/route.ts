import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import ExcelJS from "exceljs";
import { formatValue } from "@/features/forms/feedback/format-value";
import type { FormDefinition, QuestionType } from "@/features/forms/types";
import { authorize } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

type Col = { key: string; header: string; type: QuestionType; xls: boolean };

/** Export XLSX des réponses sélectionnées (spec 03 §8.2) : 1 feuille par formulaire, 1 ligne par réponse. */
export async function GET(request: NextRequest, ctx: RouteContext<"/explore/projects/[projectId]/dashboard/fields-feedback/export">) {
  const { projectId } = await ctx.params;
  const auth = await authorize("DashboardFieldFeedback", "export", projectId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 2000);
  const xlsOnly = request.nextUrl.searchParams.get("mode") === "xls";
  const locale = auth.session.organization.number_format;
  const t = await getTranslations("forms.feedback.xlsx");
  const tr = await getTranslations("forms.responses");
  const labels = { true: t("true"), false: t("false") };
  const supabase = await createClient();

  const { data: responses } = await supabase.from("form_responses")
    .select(`id, reference, state, context, provenance, form_index_label, created_at, updated_at, done_at, form_version_id, dynamic_context,
      form:forms(name), flow:flows(name, ref_int), phase:phases(name, position), step:steps(name, position),
      status:custom_statuses(name, exportable), creator:collaborators!form_responses_created_by_fkey(first_name, last_name),
      version:form_versions(structure)`)
    .eq("project_id", projectId).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).is("deleted_at", null);
  const rows = (responses ?? []).filter((r) => (r.status as { exportable: boolean } | null)?.exportable ?? true);
  if (!rows.length) return NextResponse.json({ error: "unauthorized_export" }, { status: 400 });

  const { data: values } = await supabase.from("form_response_values")
    .select("response_id, option_lineage_id, question_lineage_id, coord, question_type, value_json, observation").in("response_id", rows.map((r) => r.id));
  const { data: dynItems } = await supabase.from("form_response_dynamic_items")
    .select("response_id, lineage_id, template_lineage_id, name, position, kind").in("response_id", rows.map((r) => r.id));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Imula";
  const byForm = new Map<string, typeof rows>();
  for (const r of rows) {
    const def = (r.version as unknown as { structure: FormDefinition } | null)?.structure;
    const key = def?.lineageId ?? r.form_version_id;
    byForm.set(key, [...(byForm.get(key) ?? []), r]);
  }
  let anyXls = false;
  const usedNames = new Set<string>();
  for (const [, group] of byForm) {
    const def = (group[0].version as unknown as { structure: FormDefinition } | null)?.structure;
    const cols: Col[] = [];
    for (const rubric of def?.rubrics ?? []) for (const q of rubric.questions) {
      const items = q.type === "collaborator" ? q.signatories.map((s) => ({ ...s, label: s.name, xlsOn: !!s.xls?.enabled, xlsLabel: s.xls?.label }))
        : q.options.map((o) => ({ ...o, label: o.name ?? o.optionName, xlsOn: !!o.xls?.enabled, xlsLabel: o.xls?.label }));
      for (const o of items) {
        const header = o.xlsLabel || `${o.coord} – ${q.name}${o.label ? ` / ${o.label}` : ""}`;
        cols.push({ key: o.lineageId, header, type: q.type, xls: o.xlsOn });
      }
    }
    const visible = xlsOnly ? cols.filter((c) => c.xls) : cols;
    if (xlsOnly && !visible.length) continue;
    anyXls = true;
    let name = (def?.name ?? "Form").replace(/[\\/?*[\]:]/g, " ").slice(0, 28);
    while (usedNames.has(name)) name = `${name.slice(0, 26)}_${usedNames.size}`;
    usedNames.add(name);
    const ws = wb.addWorksheet(name);
    const meta = [t("reference"), t("form"), t("index"), t("status"), t("state"), t("provenance"), t("flow"), t("phase"), t("step"),
      t("createdAt"), t("createdBy"), t("updatedAt"), t("doneAt")];
    // Cellules ajoutées sur le terrain : colonnes supplémentaires.
    const dynCols = new Map<string, Col>();
    for (const r of group) for (const it of (dynItems ?? []).filter((d) => d.response_id === r.id)) {
      const tpl = cols.find((c) => c.key === it.template_lineage_id);
      if (tpl && !dynCols.has(it.lineage_id)) dynCols.set(it.lineage_id, { key: it.lineage_id, header: `${tpl.header} (+ ${it.name ?? `${it.kind === "option" ? "O" : "Q"}${it.position}`})`, type: tpl.type, xls: tpl.xls });
    }
    const allCols = [...visible, ...[...dynCols.values()].filter((c) => !xlsOnly || c.xls)];
    ws.addRow([...meta, ...allCols.map((c) => c.header)]).font = { bold: true };
    const date = (d: string | null) => (d ? new Date(d).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { dateStyle: "short", timeStyle: "short" }) : "");
    for (const r of group) {
      const vals = new Map((values ?? []).filter((v) => v.response_id === r.id).map((v) => [v.option_lineage_id, v]));
      const flow = r.flow as { name: string; ref_int: string | null } | null;
      const creator = r.creator as { first_name: string; last_name: string } | null;
      ws.addRow([
        r.reference, (r.form as { name: string } | null)?.name ?? "", r.form_index_label ?? "", (r.status as { name: string } | null)?.name ?? "",
        tr(`state.${r.state}`), r.provenance === "mobile" ? "MobileApp" : "WebApp", flow ? `${flow.ref_int ?? ""} ${flow.name}`.trim() : "",
        (r.phase as { name: string } | null)?.name ?? "", (r.step as { name: string } | null)?.name ?? "",
        date(r.created_at), creator ? `${creator.first_name} ${creator.last_name}` : "", date(r.updated_at), date(r.done_at),
        ...allCols.map((c) => formatValue(c.type, vals.get(c.key)?.value_json ?? null, locale, labels)),
      ]);
    }
    ws.columns.forEach((c) => { c.width = 22; });
  }
  if (xlsOnly && !anyXls) return NextResponse.json({ error: "no_xls_values" }, { status: 400 });
  const buffer = await wb.xlsx.writeBuffer();
  await supabase.from("form_response_events").insert(rows.map((r) => ({
    response_id: r.id, action: "exported", actor_id: auth.session.collaborator.id, provenance: "webapp" as const, payload: { mode: xlsOnly ? "xls" : "all" },
  })));
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="remontees-terrain-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
