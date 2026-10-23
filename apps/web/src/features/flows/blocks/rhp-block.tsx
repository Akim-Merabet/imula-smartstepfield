"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { saveRhpItem } from "../block-actions";
import { MultiSelect, type MultiOption } from "../components/multi-select";
import { SimpleSelect } from "../components/simple-select";
import { contentError } from "../content/errors";
import type { StepBlock } from "../queries";
import type { BlockProps } from "./block-panel";
import { ItemActions } from "./item-actions";

type Item = StepBlock["rhp"][number];
type Opts = { functions: MultiOption[]; skills: MultiOption[] };

/** RHP — besoins en fonction, nombre et compétences (§5.6). */
export function RhpBlock({ block, canEdit }: BlockProps) {
  const t = useTranslations("blocks.rhp");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);
  const label = (f: { short_name: string; long_name: string | null } | null) => (f ? (f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name) : "—");
  return (
    <div className="flex flex-col gap-3">
      {canEdit && <Button className="self-start" onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />{t("add")}</Button>}
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-table-head">
          <th className="py-2 pr-3">{t("function")}</th><th className="pr-3">{t("count")}</th><th className="pr-3">{t("skills")}</th><th className="w-10" />
        </tr></thead>
        <tbody>
          {block.rhp.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">{t("empty")}</td></tr>}
          {block.rhp.map((i) => (
            <tr key={i.id} className={cn("border-b", i.disabled && "text-muted-foreground line-through")}>
              <td className="py-2 pr-3 font-medium">{label(i.fn)}{i.observation && <div className="text-xs font-normal text-muted-foreground">{i.observation}</div>}</td>
              <td className="pr-3">{i.count}</td>
              <td className="pr-3">{i.skills.map((s) => label(s.skill)).join(" ; ") || "—"}</td>
              <td><ItemActions table="block_rhp_items" id={i.id} name={label(i.fn)} disabled={i.disabled} canEdit={canEdit} onView={() => setViewing(i)} onEdit={() => setEditing(i)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <RhpDialog blockId={block.id} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && (
        <ModalShell onClose={() => setViewing(null)} size="sm" title={t("viewTitle")}>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("function")}</dt><dd>{label(viewing.fn)}</dd>
            <dt className="text-muted-foreground">{t("count")}</dt><dd>{viewing.count}</dd>
            <dt className="text-muted-foreground">{t("skills")}</dt><dd>{viewing.skills.map((s) => label(s.skill)).join(" ; ") || "—"}</dd>
            <dt className="text-muted-foreground">{t("observation")}</dt><dd>{viewing.observation ?? "—"}</dd>
          </dl>
        </ModalShell>
      )}
    </div>
  );
}

function RhpDialog({ blockId, item, onClose }: { blockId: string; item: Item | null; onClose: () => void }) {
  const t = useTranslations("blocks.rhp");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [opts, setOpts] = useState<Opts | null>(null);
  const [fn, setFn] = useState<string | null>(item?.function_family_id ?? null);
  const [count, setCount] = useState(item?.count?.toString() ?? "1");
  const [skills, setSkills] = useState<string[]>(item?.skills.flatMap((s) => (s.skill ? [s.skill.id] : [])) ?? []);
  const [observation, setObservation] = useState(item?.observation ?? "");
  const [another, setAnother] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const q = (nature: "function" | "skill") => supabase.from("label_families").select("id, short_name, long_name, color")
      .eq("kind", "family").eq("nature", nature).eq("relative_nature", "child").eq("active", true).is("deleted_at", null).order("short_name");
    void Promise.all([q("function"), q("skill")]).then(([f, s]) => {
      const map = (rows: { id: string; short_name: string; long_name: string | null; color: string }[] | null) =>
        (rows ?? []).map((r) => ({ value: r.id, label: r.long_name ? `${r.short_name} - ${r.long_name}` : r.short_name, color: r.color }));
      setOpts({ functions: map(f.data), skills: map(s.data) });
    });
  }, []);

  const save = () => {
    const e: Record<string, string> = {};
    if (!fn) e.fn = tg("validators.required");
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) e.count = t("countMin");
    setErrors(e);
    if (Object.keys(e).length) return;
    start(async () => {
      const res = await saveRhpItem(blockId, { id: item?.id, function_family_id: fn!, count: n, observation, skill_ids: skills });
      if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
      notify.success(tg("toast.saved")); router.refresh();
      if (another && !item) { setFn(null); setCount("1"); setSkills([]); setObservation(""); return; }
      onClose();
    });
  };

  return (
    <ModalShell onClose={onClose} size="sm" title={item ? t("editTitle") : t("createTitle")}
      footer={<>
        {!item && <label className="mr-auto flex items-center gap-2 text-sm"><Checkbox checked={another} onCheckedChange={(v) => setAnother(!!v)} />{t("createAnother")}</label>}
        <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button onClick={save} disabled={pending || !opts}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!opts ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <FieldGroup>
          <Field data-invalid={!!errors.fn}>
            <FieldLabel>{t("function")} *</FieldLabel>
            <SimpleSelect value={fn} onChange={setFn} options={opts.functions} clearable={false} invalid={!!errors.fn} />
            {errors.fn && <FieldError>{errors.fn}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.count}>
            <FieldLabel htmlFor="rhp-count">{t("count")} *</FieldLabel>
            <Input id="rhp-count" type="number" min={1} step={1} value={count} aria-invalid={!!errors.count} onChange={(e) => setCount(e.target.value)} />
            {errors.count && <FieldError>{errors.count}</FieldError>}
          </Field>
          <Field><FieldLabel>{t("skills")}</FieldLabel><MultiSelect options={opts.skills} value={skills} onChange={setSkills} /></Field>
          <Field><FieldLabel htmlFor="rhp-obs">{t("observation")}</FieldLabel><Textarea id="rhp-obs" value={observation} onChange={(e) => setObservation(e.target.value)} /></Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
