"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileUpIcon, SearchIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { importFromLibrary } from "../actions";
import { useDocError } from "../components/use-doc-error";
import { WordingBadge } from "../components/wording-badge";
import { LIBRARY_IMPORT_MAX, stateKey, type DocumentState, type DocumentStep, type WordingFields } from "../meta";

type Row = {
  id: string; name: string; ref_int: string | null; nature: string; category_id: string | null;
  family: { id: string; short_name: string; long_name: string | null; color: string; wording_configuration_id: string | null } | null;
  versions: { index_label: string; state: DocumentState; step: DocumentStep | null; is_last: boolean; pdf_path: string | null }[];
  files: { id: string }[];
};

/** « Importer depuis la bibliothèque » (§5.5) : 10 éléments maximum, lignes déjà importées / sans fichier figées. */
export function ImportFromLibraryDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const t = useTranslations("documents");
  const tg = useTranslations("global");
  const router = useRouter();
  const docError = useDocError();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [wordings, setWordings] = useState<Record<string, WordingFields>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [family, setFamily] = useState("all");
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [{ data }, { data: copies }] = await Promise.all([
        supabase.from("documents").select(`id, name, ref_int, nature, category_id,
          family:label_families!documents_family_id_fkey(id, short_name, long_name, color, wording_configuration_id),
          versions:document_versions(index_label, state, step, is_last, pdf_path), files:document_files(id)`)
          .eq("scope", "library").is("deleted_at", null).order("name"),
        supabase.from("documents").select("library_source_id").eq("project_id", projectId).is("deleted_at", null).not("library_source_id", "is", null),
      ]);
      const list = (data ?? []) as unknown as Row[];
      setRows(list);
      setImported(new Set((copies ?? []).map((c) => c.library_source_id!)));
      const ids = [...new Set(list.map((r) => r.family?.wording_configuration_id).filter(Boolean) as string[])];
      if (ids.length) {
        const { data: langs } = await supabase.from("wording_configuration_languages").select("wording_configuration_id, fields").in("wording_configuration_id", ids);
        setWordings(Object.fromEntries((langs ?? []).map((l) => [l.wording_configuration_id, l.fields as WordingFields])));
      }
    })();
  }, [projectId]);

  const families = useMemo(() => [...new Map((rows ?? []).filter((r) => r.family).map((r) => [r.family!.id, r.family!])).values()], [rows]);
  const shown = (rows ?? []).filter((r) => (family === "all" || r.family?.id === family)
    && `${r.name} ${r.ref_int ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const frozen = (r: Row) => imported.has(r.id) || !(r.files.length || r.versions.some((v) => v.pdf_path));

  const toggle = (id: string, on: boolean) => {
    if (on && selected.length >= LIBRARY_IMPORT_MAX) { notify.error(t("import.max")); return; }
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  };
  const submit = () => start(async () => {
    const res = await importFromLibrary(projectId, selected);
    if (!res.ok) { notify.error(docError(res.error)); return; }
    notify.success(t("import.done")); router.refresh(); close();
  });

  return (
    <ModalShell onClose={close} size="xl" icon={<EntityIcon kind="project" icon={FileUpIcon} size="md" />} title={t("import.title")}
      subtitle={t("import.counter", { current: shown.length, total: rows?.length ?? 0 })}
      footer={<>
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button disabled={!selected.length || pending} onClick={submit}>{pending && <Spinner data-icon="inline-start" />}{t("import.button", { count: selected.length })}</Button>
      </>}>
      <div className="flex gap-2 pb-3">
        <InputGroup className="w-64"><InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={tg("list.searchPlaceholder")} /></InputGroup>
        <Select value={family} onValueChange={setFamily}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="all">{t("filters.family")} : {tg("all")}</SelectItem>
            {families.map((f) => <SelectItem key={f.id} value={f.id}>{f.short_name}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </div>
      {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10" /><TableHead>{t("columns.family")}</TableHead><TableHead>{t("columns.name")}</TableHead>
            <TableHead>{t("columns.refInt")}</TableHead><TableHead>{t("columns.index")}</TableHead><TableHead>{t("columns.state")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {shown.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{tg("list.emptyTitle")}</TableCell></TableRow>}
            {shown.map((r) => {
              const last = r.versions.find((v) => v.is_last);
              const isFrozen = frozen(r);
              return (
                <TableRow key={r.id} className={isFrozen ? "opacity-60" : undefined}>
                  <TableCell><Checkbox checked={selected.includes(r.id)} disabled={isFrozen} onCheckedChange={(v) => toggle(r.id, !!v)} aria-label={r.name} /></TableCell>
                  <TableCell><FamilyChip color={r.family?.color} shortName={r.family?.short_name} longName={r.family?.long_name} /></TableCell>
                  <TableCell>
                    <div className="flex flex-col"><span className="font-medium">{r.name}</span>
                      {isFrozen && <span className="text-xs text-muted-foreground">{imported.has(r.id) ? t("import.already") : t("import.noFile")}</span>}</div>
                  </TableCell>
                  <TableCell>{r.ref_int ?? "—"}</TableCell>
                  <TableCell>{r.nature === "pdf_unversioned" ? "—" : last?.index_label ?? "—"}</TableCell>
                  <TableCell><WordingBadge fields={r.family?.wording_configuration_id ? wordings[r.family.wording_configuration_id] : null} wkey={last ? stateKey(last) : "other"} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </ModalShell>
  );
}
