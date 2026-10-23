"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardListIcon, LockIcon, PencilIcon,
  SaveIcon, Share2Icon, TableIcon, Undo2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDialog } from "@/components/shell/use-dialog";
import { createClient } from "@/lib/supabase/client";
import type { NumberLocale } from "@/lib/formula/engine";
import { cn } from "@/lib/utils";
import { CAN_MANDATORY } from "../../meta";
import { setResponseInProgress, updateResponseReference, updateResponseStatus } from "../../responses/actions";
import type { CheckResult, DynamicItem, FileRef, FormDefinition } from "../../types";
import { addTableItem, finishResponse, saveRubric, setLastRubric, type ChangeSignature, type SaveCell } from "../actions";
import { buildModel, type RtCell, type RtQuestion, type RtRubric } from "../engine/model";
import {
  cellError, checkRubric, computeRedirect, evaluateCell, isFilled, prefillValue, sameJson, type DynamicCtx, type ValuesMap,
} from "../engine/values";
import { ResponseProvider, type Member, type ResponseCtx } from "./context";
import { ChangeSignatureDialog, FailedQuestionsDialog, HistoryDialog } from "./dialogs";
import { BuilderImages, QuestionBlock } from "./question-block";
import { TableRubric } from "./table-rubric";
import { GenerateDocumentButton } from "@/features/documents/pdf/generate-document-dialog";

type Stored = Record<string, { value: unknown; locked: boolean; isValid: boolean | null; observation: string | null; questionLineageId: string }>;

export type ResponseViewProps = {
  response: {
    id: string; project_id: string; reference: string; state: "in_progress" | "done"; created_at: string; custom_status_id: string | null;
    context: string; last_rubric_lineage_id: string | null; dynamic_context: DynamicCtx; form_index_label: string | null;
  };
  definition: FormDefinition;
  items: DynamicItem[];
  stored: Stored;
  formName: string;
  family: { short_name: string; long_name: string | null; color: string } | null;
  link: { initial_rubric_lineage_id: string | null; fillable_rubric_lineage_ids: string[] | null } | null;
  flow: { id: string; name: string; ref_int: string | null } | null;
  statuses: { id: string; name: string; color: string }[];
  members: Member[];
  historyCounts: Record<string, number>;
  /** Valeurs d'attributs de l'objet technique lié (questions « attribut d'objet »), lineage → valeur. */
  objectPrefill?: Record<string, unknown>;
  permissions: { edit: boolean; unlock: boolean; editRef: boolean; editStatus: boolean; share?: boolean };
  locale: NumberLocale;
  me: { id: string; firstName: string; lastName: string };
  returnTo: string;
  initialRubric: string | null;
  /** Mode partagé (contributeur externe, spec 03 §9) : actions de partage, questions `shared` seules modifiables. */
  share?: ShareMode;
};

/** Variante « partage externe » du moteur de réponse (actions serveur liées à la session de partage). */
export type ShareMode = {
  saveRubric: (input: Parameters<typeof saveRubric>[0]) => ReturnType<typeof saveRubric>;
  setLastRubric: (responseId: string, rubricLineageId: string) => Promise<unknown>;
  addTableItem: (responseId: string, rubricLineageId: string, axis: "row" | "column") => ReturnType<typeof addTableItem>;
  send: () => Promise<{ ok: true; data: { failed: CheckResult[] } } | { ok: false; error: string }>;
  onSaveLater: () => void;
  onSent: () => void;
  labels: { send: string; confirmTitle: string; confirmText: string };
};

const ERR_KEYS = ["response_done", "signature_required", "backdating", "invalid_value", "forbidden"];

export function ResponseView(props: ResponseViewProps) {
  const { response, definition, items, stored, link, permissions, locale, me } = props;
  const t = useTranslations("responses");
  const tg = useTranslations("global");
  const router = useRouter();
  const model = useMemo(() => buildModel(definition, items), [definition, items]);
  const dynamicCtx = useMemo(() => response.dynamic_context ?? {}, [response.dynamic_context]);
  const done = response.state === "done";
  const shareMode = props.share ?? null;
  const dialog = useDialog();
  const tShare = useTranslations("share.actions");
  const setLast = (id: string, rubricLineageId: string) => void (shareMode?.setLastRubric ?? setLastRubric)(id, rubricLineageId);

  // ----- valeurs -----
  const initValue = useCallback((q: RtQuestion, c: RtCell) => {
    const s = stored[c.lineageId];
    if (s) return { value: s.value ?? null, locked: s.locked, isValid: s.isValid };
    if (props.objectPrefill && c.lineageId in props.objectPrefill) return { value: props.objectPrefill[c.lineageId], locked: false };
    return { value: c.opt ? prefillValue(q.type, c.opt, dynamicCtx) : null, locked: false };
  }, [stored, dynamicCtx, props.objectPrefill]);
  const [values, setValues] = useState<ValuesMap>(() => {
    const v: ValuesMap = {};
    for (const r of model.rubrics) for (const q of r.questions) for (const c of q.cells) v[c.lineageId] = initValue(q, c);
    return v;
  });
  // Nouvelles cellules (lignes / colonnes ajoutées) : valeur initiale.
  useEffect(() => {
    setValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of model.rubrics) for (const q of r.questions) for (const c of q.cells) {
        if (!(c.lineageId in next)) { next[c.lineageId] = initValue(q, c); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [model, initValue]);
  const baseline = useRef<Map<string, { value: unknown; locked: boolean }>>(
    new Map(Object.entries(stored).map(([k, s]) => [k, { value: s.value ?? null, locked: s.locked }])));
  const obsBaseline = useRef<Record<string, string>>({});
  const [observations, setObservations] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const s of Object.values(stored)) if (s.observation) o[s.questionLineageId] = s.observation;
    obsBaseline.current = { ...o };
    return o;
  });
  const [touched, setTouched] = useState(false);
  const [historyCounts, setHistoryCounts] = useState(props.historyCounts);

  // ----- navigation -----
  const initialIndex = useMemo(() => {
    const wanted = props.initialRubric ?? response.last_rubric_lineage_id ?? link?.initial_rubric_lineage_id ?? null;
    const i = model.rubrics.findIndex((r) => r.def.lineageId === wanted);
    return i >= 0 ? i : 0;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(initialIndex);
  const rubric: RtRubric | undefined = model.rubrics[index];
  const [highlight, setHighlight] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Pas de useTransition : la fenêtre « Signature des changements » doit s'ouvrir pendant l'action.
  const startBusy = (fn: () => Promise<void>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState<CheckResult[] | null>(null);
  const [historyQ, setHistoryQ] = useState<RtQuestion | null>(null);
  const [lockQ, setLockQ] = useState<RtQuestion | null>(null);
  const [unlockQ, setUnlockQ] = useState<RtQuestion | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const sigResolver = useRef<((s: ChangeSignature | null) => void) | null>(null);
  const [sigOpen, setSigOpen] = useState(false);

  const fillable = link?.fillable_rubric_lineage_ids ? new Set(link.fillable_rubric_lineage_ids) : null;
  const rubricRO = (r: RtRubric | undefined) => done || !permissions.edit || !r || (!!fillable && !fillable.has(r.def.lineageId));
  const readOnly = rubricRO(rubric);
  const allReadOnly = fillable && model.rubrics.every((r) => !fillable.has(r.def.lineageId));

  const touchedRef = useRef(false);
  useEffect(() => { touchedRef.current = touched; }, [touched]);
  useEffect(() => {
    if (!touched) return;
    const h = (e: BeforeUnloadEvent) => { if (touchedRef.current) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [touched]);

  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => document.getElementById(`q-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    const clear = setTimeout(() => setHighlight(null), 2500);
    return () => { clearTimeout(id); clearTimeout(clear); };
  }, [highlight, index]);

  const setValue = useCallback((lineageId: string, value: unknown) => {
    setValues((v) => ({ ...v, [lineageId]: { ...v[lineageId], value, locked: v[lineageId]?.locked ?? false } }));
    setTouched(true);
  }, []);
  const setExclusive = useCallback((q: RtQuestion, lineageId: string, checked: boolean) => {
    setValues((v) => {
      const next = { ...v };
      for (const c of q.cells) next[c.lineageId] = { ...next[c.lineageId], value: c.lineageId === lineageId && checked ? true : null, locked: next[c.lineageId]?.locked ?? false };
      return next;
    });
    setTouched(true);
  }, []);

  const askSignature = () => new Promise<ChangeSignature | null>((resolve) => { sigResolver.current = resolve; setSigOpen(true); });

  const refreshHistory = useCallback(async () => {
    const { data } = await createClient().from("form_response_value_history").select("option_lineage_id").eq("response_id", response.id);
    const counts: Record<string, number> = {};
    for (const h of data ?? []) counts[h.option_lineage_id] = (counts[h.option_lineage_id] ?? 0) + 1;
    setHistoryCounts(counts);
  }, [response.id]);

  const errorMessage = (code: string) => (ERR_KEYS.includes(code) ? t(`errors.${code}`) : code === "forbidden" ? tg("toast.forbidden") : t("errors.saveFail"));

  /** Sauvegarde de la rubrique courante. Renvoie false si la sauvegarde a échoué / a été annulée. */
  const saveCurrent = async (opts: { lock?: Set<string>; target?: string } = {}): Promise<boolean> => {
    if (!rubric || readOnly) {
      if (rubric && !done && permissions.edit && opts.target) setLast(response.id, opts.target);
      return true;
    }
    const lock = opts.lock ?? new Set<string>();
    const cells: SaveCell[] = [];
    let changed = false;
    let lockedModified = false;
    for (const q of rubric.questions) {
      for (const c of q.cells) {
        const cur = values[c.lineageId]?.value ?? null;
        const base = baseline.current.get(c.lineageId);
        const wantLock = lock.has(q.lineageId) && isFilled(q.type, cur, c);
        if (cur === null && !base && !wantLock) continue;
        const diff = !base || !sameJson(base.value, cur);
        if (diff || wantLock) changed = true;
        if (base?.locked && !sameJson(base.value, cur)) lockedModified = true;
        let filesAdded: FileRef[] | null = null;
        let filesRemoved: FileRef[] | null = null;
        if (q.type === "photo" || q.type === "file") {
          const before = (base?.value as FileRef[] | null) ?? [];
          const after = (cur as FileRef[] | null) ?? [];
          filesAdded = after.filter((f) => !before.some((b) => b.fileId === f.fileId));
          filesRemoved = before.filter((b) => !after.some((f) => f.fileId === b.fileId));
        }
        cells.push({ lineageId: c.lineageId, value: cur, lock: wantLock, filesAdded, filesRemoved });
      }
    }
    const obs: Record<string, string | null> = {};
    for (const q of rubric.questions) {
      const cur = observations[q.lineageId] ?? "";
      if (cur !== (obsBaseline.current[q.lineageId] ?? "")) { obs[q.lineageId] = cur || null; changed = true; }
      else if (cur) obs[q.lineageId] = cur;
    }
    if (!changed) {
      if (opts.target) setLast(response.id, opts.target);
      return true;
    }
    let signature: ChangeSignature | null = null;
    if (lockedModified) {
      signature = await askSignature();
      if (!signature) return false;
    }
    const res = await (shareMode?.saveRubric ?? saveRubric)({
      responseId: response.id, rubricLineageId: rubric.def.lineageId, cells, observations: obs,
      activeRedirect: computeRedirect(rubric, values), changeSignature: signature, lastRubricLineageId: opts.target ?? rubric.def.lineageId,
    });
    if (!res.ok) {
      const q = (res.details as { question?: string } | undefined)?.question;
      if (res.error === "backdating") notify.error(t("errors.backdating"), t("errors.backdatingSubtitle"));
      else notify.error(errorMessage(res.error), q);
      return false;
    }
    const auto = definition.lockResponses;
    setValues((v) => {
      const next = { ...v };
      for (const c of cells) {
        const val = res.data.values[c.lineageId] ?? c.value;
        const wasLocked = baseline.current.get(c.lineageId)?.locked ?? false;
        const locked = wasLocked || ((c.lock || auto) && val !== null);
        next[c.lineageId] = { ...next[c.lineageId], value: val, locked };
        baseline.current.set(c.lineageId, { value: val, locked });
      }
      return next;
    });
    obsBaseline.current = { ...obsBaseline.current, ...Object.fromEntries(Object.entries(obs).map(([k, v]) => [k, v ?? ""])) };
    setUnlocked((u) => { const n = new Set(u); for (const q of rubric.questions) n.delete(q.lineageId); return n; });
    setTouched(false);
    touchedRef.current = false;
    if (!shareMode) void refreshHistory();
    return true;
  };

  const goTo = (i: number, scrollTo?: string) => {
    if (i < 0 || i >= model.rubrics.length || i === index) { if (scrollTo) setHighlight(scrollTo); return; }
    startBusy(async () => {
      const ok = await saveCurrent({ target: model.rubrics[i].def.lineageId });
      if (!ok) return;
      setIndex(i);
      if (scrollTo) setHighlight(scrollTo);
      else document.getElementById("response-scroll")?.scrollTo({ top: 0 });
    });
  };

  const next = () => {
    if (!rubric) return;
    startBusy(async () => {
      const redirect = !readOnly ? computeRedirect(rubric, values) : null;
      const targetIndex = redirect ? model.rubrics.findIndex((r) => r.def.lineageId === redirect.rubricLineageId) : index + 1;
      const target = model.rubrics[targetIndex >= 0 ? targetIndex : index + 1];
      const ok = await saveCurrent({ target: target?.def.lineageId });
      if (!ok) return;
      if (!readOnly) {
        const raw = checkRubric(rubric, values, response.created_at);
        // Mode partagé : seules les questions saisissables par l'externe bloquent.
        const sharedQs = raw.questions.filter((q) => model.questionByLineage.get(q.questionLineageId)?.question.def.shared);
        const check = shareMode ? { ...raw, questions: sharedQs, valid: sharedQs.length === 0 } : raw;
        if (!check.valid) { setFailed([check]); return; }
      }
      if (!target) return;
      setIndex(model.rubrics.indexOf(target));
      if (redirect?.questionLineageId) setHighlight(redirect.questionLineageId);
      else document.getElementById("response-scroll")?.scrollTo({ top: 0 });
    });
  };

  const saveLater = () => startBusy(async () => {
    const ok = await saveCurrent({ target: rubric?.def.lineageId });
    if (!ok) return;
    notify.success(t("toast.saved"), t("toast.savedLater"));
    if (shareMode) shareMode.onSaveLater();
    else router.push(props.returnTo);
  });

  const finish = () => startBusy(async () => {
    setConfirmFinish(false);
    const ok = await saveCurrent();
    if (!ok) return;
    const readOnlyRubrics = model.rubrics.filter((r) => rubricRO(r) && !done).map((r) => r.def.lineageId);
    const res = shareMode ? await shareMode.send() : await finishResponse(response.id, fillable ? readOnlyRubrics : []);
    if (!res.ok) { notify.error(errorMessage(res.error)); return; }
    if (res.data.failed.length) { setFailed(res.data.failed); return; }
    if (shareMode) { shareMode.onSent(); return; }
    notify.success(t("toast.finished"));
    router.refresh();
  });

  const calculate = (r: RtRubric, q: RtQuestion, c: RtCell) => {
    const res = evaluateCell(model, r, q, c, values, dynamicCtx, locale);
    if (res.ok) { setValue(c.lineageId, { result: res.value, unit: c.opt?.unit }); return; }
    if (res.error === "missingValue") notify.error(t("formula.evaluationFail"), t("formula.missingValues"));
    else notify.error(t("formula.evaluationFail"), t("formula.evalError"));
  };

  const doLock = () => {
    const q = lockQ;
    setLockQ(null);
    if (!q) return;
    const invalid = q.cells.some((c) => cellError(q, c, values[c.lineageId]?.value ?? null, response.created_at))
      || !q.cells.some((c) => isFilled(q.type, values[c.lineageId]?.value, c));
    if (invalid) { notify.error(t("lock.invalid")); return; }
    startBusy(async () => {
      const ok = await saveCurrent({ lock: new Set([q.lineageId]) });
      if (ok) notify.success(t("lock.done"));
    });
  };

  const addItem = async (axis: "row" | "column") => {
    if (!rubric) return;
    setAdding(true);
    const res = await (shareMode?.addTableItem ?? addTableItem)(response.id, rubric.def.lineageId, axis);
    setAdding(false);
    if (!res.ok) { notify.error(errorMessage(res.error)); return; }
    router.refresh();
  };

  // Navigation clavier Alt + flèches.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.altKey || e.metaKey)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const ctx: ResponseCtx = {
    responseId: response.id, model, values, setValue, setExclusive, observations,
    setObservation: (q, text) => { setObservations((o) => ({ ...o, [q]: text })); setTouched(true); },
    rubricReadOnly: readOnly,
    isQuestionLocked: (q) => (!!shareMode && !q.def.shared) || (q.cells.some((c) => values[c.lineageId]?.locked) && !unlocked.has(q.lineageId)),
    canLock: !shareMode,
    locale, createdAt: response.created_at, dynamicCtx, members: props.members, me, canUnlock: permissions.unlock,
    requestLock: setLockQ, requestUnlock: setUnlockQ, openHistory: setHistoryQ,
    historyCount: (q) => (shareMode ? 0 : q.cells.reduce((n, c) => n + (historyCounts[c.lineageId] ?? 0), 0)),
    calculate,
  };

  const isLast = index === model.rubrics.length - 1;
  const leave = () => (touched ? setConfirmLeave(true) : router.push(props.returnTo));
  const rubricHasLocked = (r: RtRubric) => r.questions.some((q) => q.cells.some((c) => values[c.lineageId]?.locked));
  const rubricEmpty = (r: RtRubric) => !r.questions.some((q) => q.cells.some((c) => baseline.current.has(c.lineageId)));

  return (
    <TooltipProvider>
      <ResponseProvider value={ctx}>
        <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r bg-sidebar px-3 py-4">
          {!shareMode && <Button variant="ghost" size="sm" className="mb-3 self-start" onClick={leave}><ArrowLeftIcon data-icon="inline-start" />{tg("actions.back")}</Button>}
          <div className="mb-3 flex items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded bg-entity-project-bg text-entity-project"><ClipboardListIcon className="size-5" /></span>
            <div className="min-w-0">
              <div className="truncate font-medium" title={props.formName}>{props.formName}</div>
              <div className="truncate text-sm text-muted-foreground">{t("menu.rubrics", { count: model.rubrics.length })}</div>
            </div>
          </div>
          <nav className="flex flex-col gap-0.5">
            {model.rubrics.map((r, i) => (
              <div key={r.def.lineageId}>
                <button type="button" onClick={() => goTo(i)} disabled={busy}
                  className={cn("flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent", i === index && "bg-accent font-medium")}>
                  {r.def.type === "question" ? <ClipboardListIcon className="size-4 shrink-0" /> : <TableIcon className="size-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{r.position}. {r.def.name}</span>
                  {rubricHasLocked(r) && <LockIcon className="size-3.5 text-muted-foreground" />}
                  {rubricRO(r) && !done && <Badge variant="secondary" className="h-5 px-1.5 text-[0.65rem]">{t("menu.readOnly")}</Badge>}
                </button>
                {i === index && (
                  <div className="ml-4 flex flex-col gap-0.5 border-l border-foreground/40 py-1 pl-3">
                    {r.questions.map((q) => (
                      <button key={q.lineageId} type="button" onClick={() => setHighlight(q.lineageId)}
                        className="flex items-center gap-1 rounded px-1.5 py-1 text-left text-xs hover:bg-accent">
                        <span className="min-w-0 flex-1 truncate">{q.name}</span>
                        {q.def.mandatory && CAN_MANDATORY(q.type) && <span className="text-destructive">*</span>}
                        {q.cells.some((c) => values[c.lineageId]?.locked) && <LockIcon className="size-3 text-muted-foreground" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex flex-col gap-2 border-b px-8 pt-4 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-medium">{props.formName}</h1>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <ReferenceEditor responseId={response.id} reference={response.reference} canEdit={permissions.editRef && !done} />
                  {response.form_index_label && <span>· {t("header.index", { index: response.form_index_label })}</span>}
                  {props.family && <FamilyChip color={props.family.color} shortName={props.family.short_name} longName={props.family.long_name} />}
                  {props.flow && <span>· {t("header.flow", { name: props.flow.name, ref: props.flow.ref_int ?? "—" })}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{t("header.mode")}</Badge>
                <Badge variant={done ? "default" : "secondary"}>{t(`state.${response.state}`)}</Badge>
                {!shareMode && <StatusEditor responseId={response.id} statuses={props.statuses} current={response.custom_status_id} canEdit={permissions.editStatus} />}
                {!shareMode && <GenerateDocumentButton response={{ id: response.id, reference: response.reference, projectId: response.project_id }} />}
                {!shareMode && permissions.share && (
                  <Button variant="outline" size="sm" onClick={() => dialog.open(`share/response/${response.id}`)}><Share2Icon data-icon="inline-start" />{tShare("share")}</Button>
                )}
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={t("nav.previous")} disabled={index === 0 || busy} onClick={() => goTo(index - 1)}><ChevronLeftIcon /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("nav.next")} disabled={isLast || busy} onClick={() => goTo(index + 1)}><ChevronRightIcon /></Button>
                </div>
              </div>
            </div>
            {definition.additionalComment && <p className="text-sm italic text-muted-foreground">{definition.additionalComment}</p>}
            {done && (
              <div className="flex items-center justify-between rounded-md bg-success-bg px-3 py-2 text-sm text-success">
                <span>{t("done.banner")}</span>
                {permissions.edit && !shareMode && (
                  <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)}><Undo2Icon data-icon="inline-start" />{t("done.backToInProgress")}</Button>
                )}
              </div>
            )}
            {!done && allReadOnly && <div className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">{t("readOnly.all")}</div>}
          </header>

          <div id="response-scroll" className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
            {!rubric ? <p className="text-muted-foreground">{t("empty")}</p> : (
              <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-medium">{rubric.position}. {rubric.def.name}</h2>
                    <Badge variant="secondary">{t(`rubricTypes.${rubric.def.type}`)}</Badge>
                    {rubricEmpty(rubric) && <Badge variant="outline">{t("rubric.withoutResponse")}</Badge>}
                    {rubricHasLocked(rubric) && <Badge variant="outline"><LockIcon />{t("rubric.hasLocked")}</Badge>}
                    {readOnly && !done && <Badge variant="outline">{t("menu.readOnly")}</Badge>}
                  </div>
                  {rubric.def.description && <ExpandableText text={rubric.def.description} more={t("rubric.seeMore")} less={t("rubric.seeLess")} />}
                  {rubric.def.additionalComment && <p className="text-sm italic text-muted-foreground">{rubric.def.additionalComment}</p>}
                  {rubric.def.additionalObservation && <p className="text-xs text-muted-foreground">{rubric.def.additionalObservation}</p>}
                  <BuilderImages images={rubric.def.images ?? []} />
                </div>
                {rubric.def.type === "question"
                  ? rubric.questions.map((q) => <QuestionBlock key={q.lineageId} rubric={rubric} question={q} highlighted={highlight === q.lineageId} />)
                  : <TableRubric rubric={rubric} onAdd={(a) => void addItem(a)} adding={adding} />}
              </div>
            )}
          </div>

          {!done && permissions.edit && rubric && (
            <footer className="flex items-center justify-end gap-2 border-t px-8 py-3">
              {busy && <Spinner />}
              <Button variant="outline" disabled={busy} onClick={saveLater}><SaveIcon data-icon="inline-start" />{t("actions.saveLater")}</Button>
              {isLast ? (
                <Button disabled={busy} onClick={() => setConfirmFinish(true)}><CheckIcon data-icon="inline-start" />{shareMode ? shareMode.labels.send : t("actions.finish")}</Button>
              ) : (
                <Button disabled={busy} onClick={next}>{t("actions.saveNext")}<ChevronRightIcon data-icon="inline-end" /></Button>
              )}
            </footer>
          )}
        </main>

        <FailedQuestionsDialog results={failed} onClose={() => setFailed(null)} onGo={(rl, ql) => {
          setFailed(null);
          const i = model.rubrics.findIndex((r) => r.def.lineageId === rl);
          if (i >= 0) goTo(i, ql);
        }} />
        <HistoryDialog responseId={response.id} question={historyQ} locale={locale} onClose={() => setHistoryQ(null)} />
        <ChangeSignatureDialog open={sigOpen} me={me} responseId={response.id}
          onCancel={() => { setSigOpen(false); sigResolver.current?.(null); sigResolver.current = null; }}
          onSigned={(s) => { setSigOpen(false); sigResolver.current?.(s); sigResolver.current = null; }} />
        <Confirm open={!!lockQ} onOpenChange={(o) => { if (!o) setLockQ(null); }} title={t("lock.confirmTitle")} description={t("lock.confirmText")}
          action={t("question.lock")} onConfirm={doLock} />
        <Confirm open={!!unlockQ} onOpenChange={(o) => { if (!o) setUnlockQ(null); }} title={t("unlock.confirmTitle")} description={t("unlock.confirmText")}
          action={t("question.unlock")} onConfirm={() => { if (unlockQ) setUnlocked((u) => new Set(u).add(unlockQ.lineageId)); setUnlockQ(null); }} />
        <Confirm open={confirmFinish} onOpenChange={setConfirmFinish} title={shareMode ? shareMode.labels.confirmTitle : t("finish.confirmTitle")}
          description={shareMode ? shareMode.labels.confirmText : t("finish.confirmText")}
          action={shareMode ? shareMode.labels.send : t("actions.finish")} onConfirm={finish} />
        <Confirm open={confirmLeave} onOpenChange={setConfirmLeave} title={t("leave.title")} description={t("leave.text")}
          action={tg("actions.confirm")} onConfirm={() => { setTouched(false); router.push(props.returnTo); }} />
        <Confirm open={confirmReset} onOpenChange={setConfirmReset} title={t("done.resetTitle")} description={t("done.resetText")}
          action={t("done.backToInProgress")} onConfirm={async () => {
            const res = await setResponseInProgress(response.id);
            if (!res.ok) notify.error(errorMessage(res.error)); else { notify.success(tg("toast.saved")); router.refresh(); }
          }} />
      </ResponseProvider>
    </TooltipProvider>
  );

}

function ExpandableText({ text, more, less }: { text: string; more: string; less: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return (
    <p className="text-sm text-muted-foreground">
      {long && !open ? `${text.slice(0, 220)}…` : text}
      {long && <button type="button" className="ml-1 text-info hover:underline" onClick={() => setOpen(!open)}>{open ? less : more}</button>}
    </p>
  );
}

function Confirm({ open, onOpenChange, title, description, action, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; action: string; onConfirm: () => void | Promise<void>;
}) {
  const tg = useTranslations("global");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tg("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReferenceEditor({ responseId, reference, canEdit }: { responseId: string; reference: string; canEdit: boolean }) {
  const t = useTranslations("responses.header");
  const tg = useTranslations("global");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(reference);
  const [pending, start] = useTransition();
  if (!canEdit) return <span className="font-medium text-foreground">{reference}</span>;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(reference); }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
          {reference}<PencilIcon className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <FieldGroup>
          <Field data-invalid={value.trim().length < 3}>
            <FieldLabel htmlFor="resp-ref">{t("reference")}</FieldLabel>
            <Input id="resp-ref" value={value} onChange={(e) => setValue(e.target.value)} />
            {value.trim().length < 3 && <span className="text-xs text-destructive">{t("referenceMin")}</span>}
          </Field>
          <Button disabled={pending || value.trim().length < 3} onClick={() => start(async () => {
            const res = await updateResponseReference(responseId, value);
            if (!res.ok) { notify.error(tg("toast.error")); return; }
            notify.success(tg("toast.saved")); setOpen(false); router.refresh();
          })}>{tg("actions.save")}</Button>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}

function StatusEditor({ responseId, statuses, current, canEdit }: {
  responseId: string; statuses: { id: string; name: string; color: string }[]; current: string | null; canEdit: boolean;
}) {
  const t = useTranslations("responses.status");
  const tg = useTranslations("global");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(current ?? "");
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const cur = statuses.find((s) => s.id === current);
  const badge = <StatusBadge color={cur?.color} label={cur?.name ?? t("none")} />;
  if (!canEdit) return badge;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="rounded px-2 py-1 text-sm hover:bg-muted" aria-label={t("edit")}>{badge}</button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <FieldGroup>
          <div className="font-medium">{t("edit")}</div>
          <Field>
            <FieldLabel>{t("label")}</FieldLabel>
            <Select value={status || undefined} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}><span className="size-3 rounded-sm" style={{ backgroundColor: s.color }} />{s.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="status-comment">{t("comment")}</FieldLabel>
            <Textarea id="status-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <Button disabled={pending || !status} onClick={() => start(async () => {
            const res = await updateResponseStatus(responseId, status, comment || undefined);
            if (!res.ok) { notify.error(tg("toast.error")); return; }
            notify.success(tg("toast.saved")); setOpen(false); setComment(""); router.refresh();
          })}>{tg("actions.save")}</Button>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
