"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDownIcon, ArrowUpIcon, LayoutListIcon, RefreshCwIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useDocError } from "../components/use-doc-error";
import { CLOSING_SECTION_TYPES, SECTION_SORT_MODES, type ClosingSectionType, type DocumentState, type DocumentStep } from "../meta";
import type { SectionInput } from "../schema";
import { saveSection } from "./actions";

type V = { id: string; index_label: string; state: DocumentState; step: DocumentStep | null; seq: number; diffusion_date: string | null; response_file_path: string | null };
type Doc = { id: string; name: string; ref_int: string | null; nature: string; is_large_file: boolean; closing_category_id: string | null; created_at: string; updated_at: string;
  family: { short_name: string } | null; versions: V[] };
type Item = { document_id: string | null; version_id: string | null; emm_element_id: string | null; added_at?: string };
type Emm = { id: string; name: string; reference: string | null; provider: string | null; quantity: number | null };

const FLOW_TYPES: ClosingSectionType[] = ["report", "certificate", "reference"];
const EMPTY: SectionInput = { type: "document", name: "", description: "", observation: "", category_id: null, flow_id: null,
  all_emm_elements: true, include_previous_versions: false, sort_mode: null, position: null, items: [] };

/** ?dialog=closing-section/add/<dossier>/<onglet> · closing-section/edit/<section>/<onglet> (§5.9.2). */
export default function SectionDialog({ segments, close }: DialogProps) {
  const t = useTranslations("closingFolder.section");
  const tf = useTranslations("closingFolder");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const docError = useDocError();
  const [action, id, tabSeg] = segments;
  const isEdit = action === "edit";
  const tab = tabSeg ?? "general-tab";
  const [folderId, setFolderId] = useState<string | null>(isEdit ? null : id);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [form, setForm] = useState<SectionInput>(EMPTY);
  const [items, setItems] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string; parent_id: string | null }[]>([]);
  const [flows, setFlows] = useState<{ id: string; name: string }[]>([]);
  const [emms, setEmms] = useState<Emm[]>([]);
  const [count, setCount] = useState(0);
  const [touched, setTouched] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      let fid = folderId;
      if (isEdit) {
        const { data: s } = await supabase.from("closing_sections").select("*, items:closing_section_items(document_id, version_id, emm_element_id, position, added_at)").eq("id", id).single();
        if (!s) return;
        fid = s.folder_document_id;
        setFolderId(fid);
        setForm({ type: s.type, name: s.name, description: s.description ?? "", observation: s.observation ?? "", category_id: s.category_id, flow_id: s.flow_id,
          all_emm_elements: s.all_emm_elements, include_previous_versions: s.include_previous_versions, sort_mode: s.sort_mode, position: s.position, items: [] });
        setItems(((s.items ?? []) as (Item & { position: number })[]).sort((a, b) => a.position - b.position));
        setTouched(true);
      }
      const { data: folder } = await supabase.from("documents").select("project_id").eq("id", fid!).single();
      const pid = folder?.project_id ?? null;
      setProjectId(pid);
      if (!pid) return;
      const [d, c, f, n] = await Promise.all([
        supabase.from("documents").select("id, name, ref_int, nature, is_large_file, closing_category_id, created_at, updated_at, family:label_families!documents_family_id_fkey(short_name), versions:document_versions(id, index_label, state, step, seq, diffusion_date, response_file_path)")
          .eq("project_id", pid).is("deleted_at", null).order("name"),
        supabase.from("label_families").select("id, short_name, long_name, parent_id").eq("kind", "category").eq("nature", "document").eq("project_id", pid).is("deleted_at", null).order("priority"),
        supabase.from("flows").select("id, name").eq("project_id", pid).is("deleted_at", null).order("name"),
        supabase.from("closing_sections").select("id", { count: "exact", head: true }).eq("folder_document_id", fid!),
      ]);
      setDocs(((d.data ?? []) as unknown as Doc[]).filter((x) => x.id !== fid));
      setCategories((c.data ?? []).map((x) => ({ id: x.id, label: x.long_name ? `${x.short_name} - ${x.long_name}` : x.short_name, parent_id: x.parent_id })));
      setFlows(f.data ?? []);
      setCount(n.count ?? 0);
      setLoaded(true);
    })();
  }, [id, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Moyens du flow (sections Certificat / Référence).
  useEffect(() => {
    if (!form.flow_id || !["certificate", "reference"].includes(form.type)) return;
    createClient().from("block_emm_items").select("id, name, reference, provider, quantity").eq("flow_id", form.flow_id).eq("disabled", false).order("position")
      .then(({ data }) => setEmms(data ?? []));
  }, [form.flow_id, form.type]);

  const set = (patch: Partial<SectionInput>) => setForm((f) => ({ ...f, ...patch }));
  const goTab = (tid: string) => dialog.replace(`closing-section/${action}/${id}/${tid}`);

  // Documents sélectionnables selon le type de section (§5.9.2, §5.7).
  const candidates = useMemo(() => docs.filter((d) => {
    const diffused = d.versions.some((v) => v.diffusion_date);
    if (form.type === "document") return d.nature !== "rfi" && diffused;
    if (form.type === "document_large_file") return d.nature !== "rfi" && d.is_large_file;
    if (form.type === "client_response") return d.versions.some((v) => v.response_file_path);
    if (form.type === "closing_folder") return d.nature === "rfi" && d.versions.some((v) => v.state === "bpe");
    return false;
  }), [docs, form.type]);

  // Pré-cochage par catégorie « dossier de clôture » à la création uniquement.
  const applyCategory = (categoryId: string | null) => {
    set({ category_id: categoryId });
    if (isEdit || touched || !categoryId) return;
    const childIds = new Set([categoryId, ...categories.filter((c) => c.parent_id === categoryId).map((c) => c.id)]);
    setItems(candidates.filter((d) => d.closing_category_id && childIds.has(d.closing_category_id) && !(form.type === "document" && d.is_large_file))
      .map((d) => ({ document_id: d.id, version_id: null, emm_element_id: null })));
  };

  const docItem = (docId: string) => items.find((i) => i.document_id === docId);
  const toggleDoc = (d: Doc, on: boolean) => {
    if (on && form.type === "document" && d.is_large_file) { notify.error(tf("errors.largeInSection")); return; }
    setTouched(true);
    setItems((list) => (on ? [...list, { document_id: d.id, version_id: null, emm_element_id: null }] : list.filter((i) => i.document_id !== d.id)));
  };
  const setVersion = (docId: string, versionId: string | null) => setItems((list) => list.map((i) => (i.document_id === docId ? { ...i, version_id: versionId } : i)));
  const toggleEmm = (e: Emm, on: boolean) => setItems((list) => (on ? [...list, { document_id: null, version_id: null, emm_element_id: e.id }] : list.filter((i) => i.emm_element_id !== e.id)));

  const sortItems = (mode: number) => {
    const key = (i: Item) => {
      const d = docs.find((x) => x.id === i.document_id);
      if (mode <= 2) return d?.created_at ?? ""; if (mode <= 4) return d?.updated_at ?? ""; if (mode <= 6) return i.added_at ?? "";
      if (mode <= 8) return d?.name.toLowerCase() ?? ""; return d?.ref_int?.toLowerCase() ?? "";
    };
    const desc = mode % 2 === 0;
    setItems((list) => [...list].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (desc ? -1 : 1)));
    set({ sort_mode: mode });
    notify.success(tf("sectionReordered"));
  };
  const moveItem = (index: number, dir: -1 | 1) => setItems((list) => {
    const next = [...list]; const j = index + dir;
    if (j < 0 || j >= next.length) return list;
    [next[index], next[j]] = [next[j], next[index]]; return next;
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!(form.name ?? "").trim()) e.name = tg("validators.required");
    if (FLOW_TYPES.includes(form.type as ClosingSectionType) && !form.flow_id) e.flow_id = t("flowRequired");
    setErrors(e);
    if (Object.keys(e).length) goTab("general-tab");
    return !Object.keys(e).length;
  };
  const submit = () => {
    if (!validate() || !folderId) return;
    start(async () => {
      const payload = { ...form, items: items.map((i) => ({ document_id: i.document_id, version_id: i.version_id, emm_element_id: i.emm_element_id })) };
      if (form.type === "certificate" || form.type === "reference") {
        if (form.all_emm_elements) payload.items = [];
      }
      const res = await saveSection(folderId, isEdit ? id : null, payload);
      if (!res.ok) { notify.error(res.error === "large_file_in_section" ? tf("errors.largeInSection") : res.error === "flow_required" ? t("flowRequired") : docError(res.error)); return; }
      notify.success(tg("toast.saved"));
      router.refresh();
      if (!isEdit && createAnother) { setForm(EMPTY); setItems([]); setTouched(false); setCount((c) => c + 1); return; }
      close();
    });
  };

  const isDocType = ["document", "client_response", "document_large_file", "closing_folder"].includes(form.type);
  const tabs = [{ id: "general-tab", label: t("tabs.general") }, { id: "content-tab", label: t("tabs.content") }, { id: "order-tab", label: t("tabs.order") }];
  const notDiffused = items.map((i) => docs.find((d) => d.id === i.document_id)).filter((d) => d && !d.versions.some((v) => v.diffusion_date)) as Doc[];

  return (
    <ModalShell onClose={close} size="lg" icon={<EntityIcon kind="project" icon={LayoutListIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: form.name ?? "" }) : t("createTitle")} tabs={tabs} activeTab={tab} onTabChange={goTab}
      footer={<>
        {!isEdit && <label className="mr-auto flex items-center gap-2 text-sm"><Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("createAnother")}</label>}
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : tab === "content-tab" ? (
        <FieldGroup>
          {notDiffused.length > 0 && (
            <Alert><AlertDescription>{tf("notDiffusedWarning", { list: notDiffused.map((d) => d.name).join(", ") })}</AlertDescription></Alert>
          )}
          {isDocType ? (
            <>
              <Field orientation="horizontal">
                <Switch id="s-prev" checked={!!form.include_previous_versions} onCheckedChange={(v) => set({ include_previous_versions: v })} />
                <FieldLabel htmlFor="s-prev">{t("includePrevious")}</FieldLabel>
              </Field>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10" /><TableHead>{tf("columns.name")}</TableHead><TableHead>{t("family")}</TableHead>
                  <TableHead>{tf("columns.refInt")}</TableHead><TableHead>{tf("columns.index")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {candidates.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{tg("list.emptyTitle")}</TableCell></TableRow>}
                  {candidates.map((d) => {
                    const it = docItem(d.id);
                    const diffused = [...d.versions].filter((v) => v.diffusion_date || form.type === "closing_folder").sort((a, b) => b.seq - a.seq);
                    return (
                      <TableRow key={d.id}>
                        <TableCell><Checkbox checked={!!it} onCheckedChange={(v) => toggleDoc(d, !!v)} aria-label={d.name} /></TableCell>
                        <TableCell>{d.name}{d.is_large_file && <span className="ml-2 text-xs text-muted-foreground">({tf("largeFile")})</span>}</TableCell>
                        <TableCell>{d.family?.short_name ?? "—"}</TableCell>
                        <TableCell>{d.ref_int ?? "—"}</TableCell>
                        <TableCell>
                          {it && diffused.length > 0 ? (
                            <Select value={it.version_id ?? "last"} onValueChange={(v) => setVersion(d.id, v === "last" ? null : v)}>
                              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectGroup>
                                <SelectItem value="last">{t("lastDiffused")}</SelectItem>
                                {diffused.map((v) => <SelectItem key={v.id} value={v.id}>{v.index_label}</SelectItem>)}
                              </SelectGroup></SelectContent>
                            </Select>
                          ) : diffused[0]?.index_label ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          ) : form.type === "report" ? (
            <p className="text-sm text-muted-foreground">{t("reportHelp")}</p>
          ) : (
            <>
              <RadioGroup value={form.all_emm_elements ? "all" : "some"} onValueChange={(v) => set({ all_emm_elements: v === "all" })} className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="all" />{t(form.type === "certificate" ? "allCertificates" : "allReferences")}</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="some" />{t("someEquipments")}</label>
              </RadioGroup>
              {!form.all_emm_elements && (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-10" /><TableHead>{tf("columns.name")}</TableHead><TableHead>{t("reference")}</TableHead>
                    <TableHead>{t("provider")}</TableHead><TableHead>{t("quantity")}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {emms.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell><Checkbox checked={items.some((i) => i.emm_element_id === e.id)} onCheckedChange={(v) => toggleEmm(e, !!v)} aria-label={e.name} /></TableCell>
                        <TableCell>{e.name}</TableCell><TableCell>{e.reference ?? "—"}</TableCell><TableCell>{e.provider ?? "—"}</TableCell><TableCell>{e.quantity ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </FieldGroup>
      ) : tab === "order-tab" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("sortBy")}</FieldLabel>
            <Select value={form.sort_mode ? String(form.sort_mode) : undefined} onValueChange={(v) => sortItems(Number(v))}>
              <SelectTrigger><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
              <SelectContent><SelectGroup>{SECTION_SORT_MODES.map((m) => <SelectItem key={m} value={String(m)}>{t(`sortModes.${m}`)}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <ul className="flex flex-col divide-y rounded-md border">
            {items.length === 0 && <li className="p-3 text-center text-sm text-muted-foreground">{tf("empty.items")}</li>}
            {items.map((i, n) => {
              const label = docs.find((d) => d.id === i.document_id)?.name ?? emms.find((e) => e.id === i.emm_element_id)?.name ?? "—";
              return (
                <li key={`${i.document_id}-${i.emm_element_id}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="w-6 text-muted-foreground">{n + 1}</span><span className="flex-1 truncate">{label}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={tf("actions.up")} disabled={n === 0} onClick={() => moveItem(n, -1)}><ArrowUpIcon /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label={tf("actions.down")} disabled={n === items.length - 1} onClick={() => moveItem(n, 1)}><ArrowDownIcon /></Button>
                </li>
              );
            })}
          </ul>
          <Button variant="ghost" className="self-start" onClick={() => goTab("content-tab")}><RefreshCwIcon data-icon="inline-start" />{t("refreshFromContent")}</Button>
        </FieldGroup>
      ) : (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("type")} *</FieldLabel>
            <Select value={form.type} disabled={isEdit} onValueChange={(v) => { set({ type: v as ClosingSectionType, flow_id: null }); setItems([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{CLOSING_SECTION_TYPES.map((ty) => <SelectItem key={ty} value={ty}>{tf(`typesLong.${ty}`)}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="s-name">{t("name")} *</FieldLabel>
            <Input id="s-name" value={form.name ?? ""} maxLength={255} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!errors.name} />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field><FieldLabel htmlFor="s-desc">{t("description")}</FieldLabel><Textarea id="s-desc" value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} /></Field>
          {FLOW_TYPES.includes(form.type as ClosingSectionType) && (
            <Field data-invalid={!!errors.flow_id}>
              <FieldLabel>{form.type === "report" ? t("reportFlow") : t("flow")} *</FieldLabel>
              <Select value={form.flow_id ?? undefined} onValueChange={(v) => set({ flow_id: v })}>
                <SelectTrigger aria-invalid={!!errors.flow_id}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
                <SelectContent><SelectGroup>{flows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              {errors.flow_id && <FieldError>{errors.flow_id}</FieldError>}
            </Field>
          )}
          {isDocType && form.type !== "closing_folder" && (
            <Field>
              <FieldLabel>{t("category")}</FieldLabel>
              <Select value={form.category_id ?? "none"} onValueChange={(v) => applyCategory(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="none">{tg("none")}</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>{t("categoryHelp")}</FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel>{t("position")}</FieldLabel>
            <Select value={form.position == null ? "last" : String(form.position)} onValueChange={(v) => set({ position: v === "last" ? null : Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="last">{t("lastPosition")}</SelectItem>
                {Array.from({ length: count + (isEdit ? 0 : 1) }, (_, i) => <SelectItem key={i} value={String(i)}>{i + 1}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field><FieldLabel htmlFor="s-obs">{t("observation")}</FieldLabel><Textarea id="s-obs" value={form.observation ?? ""} onChange={(e) => set({ observation: e.target.value })} /></Field>
          {projectId === null && <span />}
        </FieldGroup>
      )}
    </ModalShell>
  );
}
