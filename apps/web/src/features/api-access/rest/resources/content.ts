import "server-only";
import { z } from "zod";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { conflict, notFound } from "../errors";
import { apiRoute, dbCheck, list, one, page, type ApiContext } from "../handler";
import { upper } from "../mappers";
import { parseBody, parseEmbed, parsePaging, pathUuid } from "../params";
import { loadFlow } from "./flows";

export const PHASE_EMBEDS = ["STEPS"] as const;
type BlockType = Enums<"block_type">;
const BLOCK_TYPES: readonly BlockType[] = ["pr", "emm", "adr", "dsi", "form", "txt", "rhp", "multi_pr", "object"];
/** Blocs thématiques : noms API = types internes en MAJUSCULES ; INSTRUCTION est un alias de PR. */
const THEMATIC = z.string().toUpperCase().transform((v) => (v === "INSTRUCTION" ? "PR" : v))
  .pipe(z.enum(BLOCK_TYPES.map((b) => b.toUpperCase()) as [string, ...string[]]));

type PhaseRow = Tables<"phases">;
type StepRow = Tables<"steps">;

function mapPhase(p: PhaseRow) {
  return {
    uuidEntity: p.id,
    flowId: p.flow_id,
    number: p.position,
    customOrderingNumber: p.custom_number,
    isCustomOrderingNumberExcludedFromNumbering: p.exclude_numbering,
    name: p.name,
    description: p.description,
    internalInformation: p.additional_comment,
    isEnabled: !p.disabled,
    commentOnStateChange: p.disabled_comment,
    sequenceType: upper(p.sequence_type),
    mandatory: p.mandatory,
    readOnlyOnMobileApp: p.read_only_on_mobile_app,
  };
}

function mapStep(s: StepRow, blocks: { step_id: string; type: BlockType; enabled: boolean }[]) {
  return {
    uuidEntity: s.id,
    flowId: s.flow_id,
    phaseId: s.phase_id,
    number: s.position,
    customOrderingNumber: s.custom_number,
    isCustomOrderingNumberExcludedFromNumbering: s.exclude_numbering,
    name: s.name,
    description: s.description,
    internalInformation: s.additional_comment,
    isEnabled: !s.disabled,
    commentOnStateChange: s.disabled_comment,
    readOnlyOnMobileApp: s.read_only_on_mobile_app,
    linkedFlowId: s.linked_flow_id,
    validatedAt: s.validated_at,
    listEnabledThematicBlocks: blocks.filter((b) => b.step_id === s.id && b.enabled).map((b) => b.type.toUpperCase()),
  };
}

async function stepsWithBlocks(ctx: ApiContext, steps: StepRow[]) {
  const blocks = steps.length
    ? dbCheck(await ctx.db.from("blocks").select("step_id, type, enabled").in("step_id", steps.map((s) => s.id))) ?? []
    : [];
  return steps.map((s) => mapStep(s, blocks));
}

async function loadPhase(ctx: ApiContext, flowId: string, phaseId: string) {
  const phase = dbCheck(await ctx.db.from("phases").select("*").eq("id", phaseId).eq("flow_id", flowId).maybeSingle());
  if (!phase) throw notFound("Phase", phaseId);
  return phase;
}

/** GET /flows/{flowId}/phases — phases (et optionnellement étapes, embed STEPS), ordonnées par position. */
export const listPhases = apiRoute<{ flowId: string }>({ level: "L1" }, async (ctx, params) => {
  const flowId = pathUuid(params.flowId, "flowId");
  const paging = parsePaging(ctx.url.searchParams);
  const embed = parseEmbed(ctx.url.searchParams, PHASE_EMBEDS);
  await loadFlow(ctx, flowId);
  const { items, total } = await page<PhaseRow>(paging, (from, to) =>
    ctx.db.from("phases").select("*", { count: "exact" }).eq("flow_id", flowId).order("position").range(from, to));
  let steps: ReturnType<typeof mapStep>[] = [];
  if (embed.has("STEPS") && items.length) {
    const rows = dbCheck(await ctx.db.from("steps").select("*").in("phase_id", items.map((p) => p.id)).order("position")) ?? [];
    steps = await stepsWithBlocks(ctx, rows);
  }
  return list(items.map((p) => embed.has("STEPS") ? { ...mapPhase(p), steps: steps.filter((s) => s.phaseId === p.id) } : mapPhase(p)), total);
});

/** GET /flows/{flowId}/phases/{phaseId}/steps — étapes d'une phase. */
export const listSteps = apiRoute<{ flowId: string; phaseId: string }>({ level: "L1" }, async (ctx, params) => {
  const flowId = pathUuid(params.flowId, "flowId");
  const phaseId = pathUuid(params.phaseId, "phaseId");
  const paging = parsePaging(ctx.url.searchParams);
  await loadFlow(ctx, flowId);
  await loadPhase(ctx, flowId, phaseId);
  const { items, total } = await page<StepRow>(paging, (from, to) =>
    ctx.db.from("steps").select("*", { count: "exact" }).eq("phase_id", phaseId).order("position").range(from, to));
  return list(await stepsWithBlocks(ctx, items), total);
});

const contentItem = {
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).nullish(),
  internalInformation: z.string().trim().max(5000).nullish(),
  customOrderingNumber: z.string().trim().max(50).nullish(),
  isCustomOrderingNumberExcludedFromNumbering: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  readOnlyOnMobileApp: z.boolean().optional(),
};
export const addPhasesSchema = z.object({
  data: z.array(z.object({
    ...contentItem,
    sequenceType: z.enum(["LINEAR", "PARALLEL"]).optional(),
    mandatory: z.boolean().optional(),
  }).strict()).min(1).max(100),
}).strict();
export const addStepsSchema = z.object({
  data: z.array(z.object({ ...contentItem, listEnabledThematicBlocks: z.array(THEMATIC).max(9).optional() }).strict()).min(1).max(100),
}).strict();

function commonColumns(i: z.output<z.ZodObject<typeof contentItem>>) {
  return {
    name: i.name,
    description: i.description ?? null,
    additional_comment: i.internalInformation ?? null,
    custom_number: i.customOrderingNumber ?? null,
    exclude_numbering: i.isCustomOrderingNumberExcludedFromNumbering ?? false,
    disabled: i.isEnabled === false,
    read_only_on_mobile_app: i.readOnlyOnMobileApp ?? false,
  };
}

/** POST /flows/{flowId}/add-phases — ajoute des phases en fin de flow. */
export const addPhases = apiRoute<{ flowId: string }>({ level: "L2" }, async (ctx, params) => {
  const flowId = pathUuid(params.flowId, "flowId");
  const body = await parseBody(ctx.req, addPhasesSchema);
  await loadFlow(ctx, flowId, { write: true });
  const last = dbCheck(await ctx.db.from("phases").select("position").eq("flow_id", flowId).order("position", { ascending: false }).limit(1).maybeSingle());
  const start = last?.position ?? 0;
  const rows = dbCheck(await ctx.db.from("phases").insert(body.data.map((p, i) => ({
    ...commonColumns(p),
    flow_id: flowId,
    position: start + i + 1,
    sequence_type: (p.sequenceType?.toLowerCase() ?? "linear") as Enums<"sequencing_type">,
    mandatory: p.mandatory ?? true,
  }))).select("*").order("position")) ?? [];
  return one(rows.map(mapPhase), 201);
});

/** POST /flows/{flowId}/phases/{phaseId}/add-steps — ajoute des étapes en fin de phase (avec leurs blocs thématiques). */
export const addSteps = apiRoute<{ flowId: string; phaseId: string }>({ level: "L2" }, async (ctx, params) => {
  const flowId = pathUuid(params.flowId, "flowId");
  const phaseId = pathUuid(params.phaseId, "phaseId");
  const body = await parseBody(ctx.req, addStepsSchema);
  await loadFlow(ctx, flowId, { write: true });
  await loadPhase(ctx, flowId, phaseId);
  const last = dbCheck(await ctx.db.from("steps").select("position").eq("phase_id", phaseId).order("position", { ascending: false }).limit(1).maybeSingle());
  const start = last?.position ?? 0;
  const steps = dbCheck(await ctx.db.from("steps").insert(body.data.map((s, i) => ({
    ...commonColumns(s), phase_id: phaseId, flow_id: flowId, position: start + i + 1,
  }))).select("*").order("position")) ?? [];
  const blocks = steps.flatMap((s, i) => [...new Set(body.data[i].listEnabledThematicBlocks ?? [])].map((t) => {
    const type = t.toLowerCase() as BlockType;
    return { step_id: s.id, flow_id: flowId, type, txt_visibility: type === "txt" ? ("mobile_app" as const) : null };
  }));
  if (blocks.length) {
    const created = dbCheck(await ctx.db.from("blocks").insert(blocks).select("id, type")) ?? [];
    if (created.length !== blocks.length) throw conflict("Thematic blocks could not be created");
    await Promise.all([
      ctx.db.from("block_state_events").insert(created.map((b) => ({ block_id: b.id, flow_id: flowId, action: "create" as const, to_state: "redaction" as const }))),
      ...created.filter((b) => b.type === "dsi").map((b) => ctx.db.from("block_dsi_configs").insert({ block_id: b.id, flow_id: flowId })),
      ...created.filter((b) => b.type === "multi_pr").map((b) => ctx.db.from("block_multi_pr_items").insert({ block_id: b.id, flow_id: flowId, position: 1, title: null })),
    ]);
  }
  return one(await stepsWithBlocks(ctx, steps), 201);
});
