import "server-only";
import { Constants, type Enums, type Tables } from "@/lib/supabase/database.types";
import { notFound } from "../errors";
import { accountScopeFilter, apiRoute, assertReadable, dbCheck, list, one, page, type ApiContext } from "../handler";
import { managementProperties, MANAGEMENT_PROPERTIES, upper, withEmbeds } from "../mappers";
import { boolParam, enumListParam, likePattern, parseDateFilters, parseEmbed, parsePaging, pathUuid, textParam, uuidParam } from "../params";

export const DOCUMENT_EMBEDS = [MANAGEMENT_PROPERTIES, "FLOW", "LAST_VERSION"] as const;
type DocEmbed = (typeof DOCUMENT_EMBEDS)[number];
const SOURCES: readonly Enums<"document_source">[] = ["flow", "form", "module", "extern", "closing_folder"];
const SCOPES: readonly Enums<"document_scope">[] = ["library", "project"];
const DOCUMENT_NATURES: readonly Enums<"document_nature">[] = Constants.public.Enums.document_nature;
const PDF_URL_TTL_SECONDS = 600;

type DocRow = Tables<"documents">;
type VersionRow = Tables<"document_versions">;

function mapVersion(v: VersionRow) {
  return {
    uuidEntity: v.id,
    documentFlowId: v.document_id,
    seq: v.seq,
    index: v.index_label,
    isSubIndex: v.is_sub_index,
    state: upper(v.state),
    step: upper(v.step),
    visa: upper(v.visa),
    isLastVersion: v.is_last,
    diffusedAt: v.diffusion_date,
    diffusionComment: v.diffusion_comment,
    bpeAt: v.bpe_date,
    clientResponseAt: v.response_date,
    clientResponseLabel: v.response_label,
    clientResponseRef: v.response_ref,
    hasPdf: !!v.pdf_path,
    pdfName: v.pdf_name,
    pdfSize: v.pdf_size,
    createdAt: v.created_at,
    modifiedAt: v.updated_at,
  };
}

function mapDocument(d: DocRow) {
  return {
    uuidEntity: d.id,
    uuidOrganization: d.organization_id,
    uuidAccount: d.account_id,
    scope: upper(d.scope),
    projectId: d.project_id,
    documentOrigin: upper(d.origin),
    source: upper(d.source),
    name: d.name,
    natureFile: upper(d.nature),
    labelFamilyId: d.family_id,
    projectLabelFamilyId: d.category_id,
    secondaryProjectLabelFamilyId: d.closing_category_id,
    refInt: d.ref_int,
    refExt: d.ref_ext,
    flowId: d.linked_flow_id,
    formId: d.linked_form_id,
    formResponseId: d.linked_response_id,
    isDeleted: !!d.deleted_at,
  };
}

async function present(ctx: ApiContext, rows: DocRow[], embed: Set<DocEmbed>) {
  const ids = rows.map((d) => d.id);
  const [lasts, flows] = await Promise.all([
    ids.length ? ctx.db.from("document_versions").select("*").in("document_id", ids).eq("is_last", true).then(dbCheck) : [],
    embed.has("FLOW") && rows.some((d) => d.linked_flow_id)
      ? ctx.db.from("flows").select("id, name, ref_int, ref_ext").in("id", rows.map((d) => d.linked_flow_id).filter(Boolean) as string[]).then(dbCheck)
      : null,
  ]);
  return rows.map((d) => {
    const last = (lasts ?? []).find((v) => v.document_id === d.id) ?? null;
    const flow = flows?.find((f) => f.id === d.linked_flow_id);
    return withEmbeds({ ...mapDocument(d), lastVersionDocumentFlowId: last?.id ?? null }, {
      managementProperties: embed.has(MANAGEMENT_PROPERTIES) ? managementProperties(d) : undefined,
      lastVersion: embed.has("LAST_VERSION") ? (last ? mapVersion(last) : null) : undefined,
      flow: embed.has("FLOW") ? (flow ? { uuidEntity: flow.id, name: flow.name, refInt: flow.ref_int, refExt: flow.ref_ext } : null) : undefined,
    });
  });
}

/** GET /document-flows — filtres : projectId, flowId, name, refInt, refExt, nature, source, scope, isDeleted, dates. */
export const listDocuments = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const embed = parseEmbed(sp, DOCUMENT_EMBEDS);
  const dates = parseDateFilters(sp);
  const projectId = uuidParam(sp, "projectId");
  const flowId = uuidParam(sp, "flowId");
  const name = textParam(sp, "name");
  const refInt = textParam(sp, "refInt");
  const refExt = textParam(sp, "refExt");
  const natures = enumListParam(sp, "nature", DOCUMENT_NATURES);
  const sources = enumListParam(sp, "source", SOURCES);
  const scopes = enumListParam(sp, "scope", SCOPES);
  const deleted = boolParam(sp, "isDeleted");
  const scope = await accountScopeFilter(ctx);
  const { items, total } = await page<DocRow>(paging, (from, to) => {
    let q = ctx.db.from("documents").select("*", { count: "exact" }).eq("organization_id", ctx.organizationId).or(scope);
    q = deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    if (projectId) q = q.eq("project_id", projectId);
    if (flowId) q = q.eq("linked_flow_id", flowId);
    if (name) q = q.ilike("name", likePattern(name));
    if (refInt) q = q.eq("ref_int", refInt);
    if (refExt) q = q.eq("ref_ext", refExt);
    if (natures.length) q = q.in("nature", natures);
    if (sources.length) q = q.in("source", sources);
    if (scopes.length) q = q.in("scope", scopes);
    if (dates.createdAfterAt) q = q.gt("created_at", dates.createdAfterAt);
    if (dates.modifiedAfterAt) q = q.gt("updated_at", dates.modifiedAfterAt);
    return q.order("created_at").order("id").range(from, to);
  });
  return list(await present(ctx, items, embed), total);
});

async function loadDocument(ctx: ApiContext, id: string) {
  const d = dbCheck(await ctx.db.from("documents").select("*").eq("id", id).eq("organization_id", ctx.organizationId).is("deleted_at", null).maybeSingle());
  if (!d) throw notFound("Document", id);
  await assertReadable(ctx, d);
  return d;
}

/** GET /document-flows/{documentId} */
export const getDocument = apiRoute<{ documentId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.documentId, "documentId");
  const embed = parseEmbed(ctx.url.searchParams, DOCUMENT_EMBEDS);
  const d = await loadDocument(ctx, id);
  return one((await present(ctx, [d], embed))[0]);
});

/** GET /document-flows/{documentId}/versions — lignes du suivi, par ordre chronologique. */
export const listDocumentVersions = apiRoute<{ documentId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.documentId, "documentId");
  const paging = parsePaging(ctx.url.searchParams);
  await loadDocument(ctx, id);
  const { items, total } = await page<VersionRow>(paging, (from, to) =>
    ctx.db.from("document_versions").select("*", { count: "exact" }).eq("document_id", id).order("seq").range(from, to));
  return list(items.map(mapVersion), total);
});

/** GET /document-flows/{documentId}/last-versions — dernière ligne du suivi. */
export const getLastVersion = apiRoute<{ documentId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.documentId, "documentId");
  await loadDocument(ctx, id);
  const v = dbCheck(await ctx.db.from("document_versions").select("*").eq("document_id", id).eq("is_last", true).maybeSingle());
  if (!v) throw notFound("Document version", id);
  return one(mapVersion(v));
});

/**
 * GET /document-flows/{documentId}/last-versions-pdf — URL signée (10 min) du PDF de la dernière version
 * (PDF figé de l'indice, sinon premier fichier joint pour un document externe).
 */
export const getLastVersionPdf = apiRoute<{ documentId: string }>({ level: "L2" }, async (ctx, params) => {
  const id = pathUuid(params.documentId, "documentId");
  await loadDocument(ctx, id);
  const versions = dbCheck(await ctx.db.from("document_versions").select("id, pdf_path, pdf_name, index_label")
    .eq("document_id", id).not("pdf_path", "is", null).order("seq", { ascending: false }).limit(1)) ?? [];
  let path = versions[0]?.pdf_path ?? null;
  let fileName = versions[0]?.pdf_name ?? null;
  if (!path) {
    const files = dbCheck(await ctx.db.from("document_files").select("storage_path, name").eq("document_id", id).order("position").limit(1)) ?? [];
    path = files[0]?.storage_path ?? null;
    fileName = files[0]?.name ?? null;
  }
  if (!path) throw notFound("Document PDF", id);
  const { data, error } = await ctx.db.storage.from("documents").createSignedUrl(path, PDF_URL_TTL_SECONDS);
  if (error || !data) throw notFound("Document PDF", id);
  return one({
    documentFlowId: id,
    versionId: versions[0]?.id ?? null,
    index: versions[0]?.index_label ?? null,
    fileName,
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + PDF_URL_TTL_SECONDS * 1000).toISOString(),
  });
});
