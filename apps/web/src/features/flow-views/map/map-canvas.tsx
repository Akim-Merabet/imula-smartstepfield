"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import L from "leaflet";
import { Circle, GeoJSON, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip as LTooltip, useMapEvents } from "react-leaflet";
import {
  ArchiveIcon, CaravanIcon, CheckIcon, CircleIcon, HardHatIcon, LayersIcon, MapPinIcon, MousePointer2Icon, PentagonIcon, RocketIcon,
  SearchIcon, SplineIcon, TagIcon, ToolboxIcon, TractorIcon, TruckIcon, WarehouseIcon, XIcon, type LucideIcon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { MultiSelect } from "@/features/flows/components/multi-select";
import { SimpleSelect } from "@/features/flows/components/simple-select";
import type { ViewFlow } from "../queries";
import { createGeometry, deleteGeometry, updateGeometry, type GeometryInput } from "./actions";
import { LayersSheet } from "./layers-sheet";

type Geo = Tables<"flow_geometries">;
type Layer = Tables<"project_geojson_layers">;
type LatLng = [number, number];
type Mode = "none" | "point" | "polyline" | "polygon" | "circle";
type Icon = Geo["icon"];

export const ICONS: Record<Icon, LucideIcon | null> = {
  default: MapPinIcon, without_icon: null, truck: TruckIcon, snowplow: TractorIcon, warehouse: WarehouseIcon,
  archive: ArchiveIcon, hard_hat: HardHatIcon, toolbox: ToolboxIcon, rocket: RocketIcon, caravan: CaravanIcon,
};

export type MapCanvasProps = {
  projectId: string; flows: ViewFlow[]; geometries: Geo[]; layers: Layer[];
  statuses: { id: string; name: string; color: string }[]; families: { id: string; short_name: string; color: string }[];
  permissions: { add: boolean; edit: boolean; delete: boolean };
};

const DEFAULT_COLOR = "#2563eb";
const iconCache = new Map<string, L.DivIcon>();
function markerIcon(icon: Icon, color: string) {
  const key = `${icon}|${color}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const Svg = ICONS[icon];
  const made = !Svg
    ? L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8],
        html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px #0006"></span>` })
    : L.divIcon({ className: "", iconSize: [30, 38], iconAnchor: [15, 37], popupAnchor: [0, -32], tooltipAnchor: [0, -30],
        html: `<div style="position:relative;width:30px;height:38px;filter:drop-shadow(0 1px 2px #0006)"><svg viewBox="0 0 30 38" width="30" height="38"><path d="M15 37C15 37 2 22 2 14a13 13 0 0 1 26 0c0 8-13 23-13 23z" fill="${color}" stroke="#fff" stroke-width="2"/></svg><span style="position:absolute;left:7px;top:6px;line-height:0">${renderToStaticMarkup(<Svg size={16} color="#fff" strokeWidth={2.25} />)}</span></div>` });
  iconCache.set(key, made);
  return made;
}

// ===== Géométrie (GeoJSON [lng, lat] ↔ Leaflet [lat, lng]) ==============================
type GeoJsonGeom = { type: "Point"; coordinates: [number, number] } | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] };

const toLL = ([lng, lat]: [number, number]): LatLng => [lat, lng];
const toPos = ([lat, lng]: LatLng): [number, number] => [lng, lat];
export function geoPoints(g: Geo): LatLng[] {
  const gj = g.geojson as unknown as GeoJsonGeom;
  if (gj.type === "Point") return [toLL(gj.coordinates)];
  if (gj.type === "LineString") return gj.coordinates.map(toLL);
  return gj.coordinates[0].slice(0, -1).map(toLL);
}
const centroid = (pts: LatLng[]): LatLng => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
function buildGeojson(kind: Geo["kind"], pts: LatLng[]): GeometryInput["geojson"] {
  if (kind === "point" || kind === "circle") return { type: "Point", coordinates: toPos(pts[0]) };
  if (kind === "polyline") return { type: "LineString", coordinates: pts.map(toPos) };
  return { type: "Polygon", coordinates: [[...pts, pts[0]].map(toPos)] };
}

/** Vue carte (§3.3) : géométries des flows, outils de dessin, couches GeoJSON. */
export function MapCanvas({ projectId, flows, geometries, layers, statuses, families, permissions }: MapCanvasProps) {
  const t = useTranslations("flowViews.map");
  const tg = useTranslations("global");
  const router = useRouter();
  const [map, setMap] = useState<L.Map | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [familyFilter, setFamilyFilter] = useState<string[]>([]);
  const [search, setSearch] = useState({ lat: "", lng: "", zoom: "16" });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [, start] = useTransition();
  const flowById = useMemo(() => new Map(flows.map((f) => [f.id, f])), [flows]);

  const visible = geometries.filter((g) => {
    if (!statusFilter.length && !familyFilter.length) return true;
    const f = g.flow_id ? flowById.get(g.flow_id) : undefined;
    if (!f) return false;
    return (!statusFilter.length || (f.custom_status_id && statusFilter.includes(f.custom_status_id)))
      && (!familyFilter.length || (f.family_id && familyFilter.includes(f.family_id)));
  });

  // Cadrage initial sur les géométries.
  const fitted = useRef(false);
  useEffect(() => {
    if (!map || fitted.current) return;
    fitted.current = true;
    const pts = geometries.flatMap(geoPoints);
    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
  }, [map, geometries]);

  useEffect(() => {
    if (!map) return;
    if (mode === "none") map.doubleClickZoom.enable(); else map.doubleClickZoom.disable();
    map.getContainer().style.cursor = mode !== "none" || moving ? "crosshair" : "";
  }, [map, mode, moving]);

  const reset = () => { setMode("none"); setDraft([]); setCursor(null); };

  const create = (kind: GeometryInput["kind"], pts: LatLng[], radius?: number) => {
    reset();
    start(async () => {
      const res = await createGeometry(projectId, { kind, geojson: buildGeojson(kind, pts), radius_m: radius ?? null, icon: "default" });
      if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
      setFocusId(res.data.id);
      router.refresh();
    });
  };

  const finish = () => {
    if (mode === "polyline" && draft.length >= 2) create("polyline", draft);
    else if (mode === "polygon" && draft.length >= 3) create("polygon", draft);
    else notify.warning(t("draw.notEnough"));
  };

  const onMapClick = (ll: LatLng) => {
    if (moving) {
      const g = geometries.find((x) => x.id === moving);
      setMoving(null);
      if (!g) return;
      const pts = geoPoints(g);
      const [clat, clng] = g.kind === "point" || g.kind === "circle" ? pts[0] : centroid(pts);
      const moved = pts.map(([a, b]) => [a + ll[0] - clat, b + ll[1] - clng] as LatLng);
      start(async () => {
        const res = await updateGeometry(g.id, { geojson: buildGeojson(g.kind, moved) });
        if (!res.ok) notify.error(tg("toast.error")); else { notify.success(t("popup.moved")); router.refresh(); }
      });
      return;
    }
    if (mode === "point") create("point", [ll]);
    else if (mode === "polyline" || mode === "polygon") setDraft((d) => [...d, ll]);
    else if (mode === "circle") {
      if (!draft.length) setDraft([ll]);
      else create("circle", draft, Math.max(1, Math.round(L.latLng(draft[0]).distanceTo(L.latLng(ll)))));
    }
  };

  const goTo = () => {
    const lat = Number(search.lat.replace(",", ".")), lng = Number(search.lng.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !search.lat || !search.lng) {
      notify.error(t("search.invalid")); return;
    }
    map?.setView([lat, lng], Math.min(19, Math.max(1, Number(search.zoom) || 16)));
  };

  const tools: { mode: Mode; icon: LucideIcon }[] = [
    { mode: "none", icon: MousePointer2Icon }, { mode: "point", icon: MapPinIcon }, { mode: "polyline", icon: SplineIcon },
    { mode: "polygon", icon: PentagonIcon }, { mode: "circle", icon: CircleIcon },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {permissions.add && (
          <ToggleGroup type="single" variant="outline" value={mode} onValueChange={(v) => { setDraft([]); setMode((v || "none") as Mode); }} aria-label={t("draw.title")}>
            {tools.map(({ mode: m, icon: I }) => (
              <Tooltip key={m}>
                <TooltipTrigger asChild><ToggleGroupItem value={m} aria-label={t(`draw.${m}`)}><I /></ToggleGroupItem></TooltipTrigger>
                <TooltipContent>{t(`draw.${m}`)}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        )}
        <div className="flex items-end gap-2">
          <Field className="w-28"><FieldLabel htmlFor="map-lat" className="text-xs">{t("search.latitude")}</FieldLabel>
            <Input id="map-lat" value={search.lat} onChange={(e) => setSearch({ ...search, lat: e.target.value })} onKeyDown={(e) => e.key === "Enter" && goTo()} /></Field>
          <Field className="w-28"><FieldLabel htmlFor="map-lng" className="text-xs">{t("search.longitude")}</FieldLabel>
            <Input id="map-lng" value={search.lng} onChange={(e) => setSearch({ ...search, lng: e.target.value })} onKeyDown={(e) => e.key === "Enter" && goTo()} /></Field>
          <Field className="w-16"><FieldLabel htmlFor="map-zoom" className="text-xs">{t("search.zoom")}</FieldLabel>
            <Input id="map-zoom" type="number" min={1} max={19} value={search.zoom} onChange={(e) => setSearch({ ...search, zoom: e.target.value })} /></Field>
          <Button variant="secondary" size="icon" aria-label={t("search.search")} onClick={goTo}><SearchIcon /></Button>
        </div>
        <div className="w-52"><MultiSelect options={statuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))} value={statusFilter} onChange={setStatusFilter} placeholder={t("filters.status")} /></div>
        <div className="w-52"><MultiSelect options={families.map((f) => ({ value: f.id, label: f.short_name, color: f.color }))} value={familyFilter} onChange={setFamilyFilter} placeholder={t("filters.family")} /></div>
        <Button variant="ghost" onClick={() => setShowLabels((s) => !s)}><TagIcon data-icon="inline-start" />{showLabels ? t("hideLabels") : t("showLabels")}</Button>
        <Button variant="secondary" className="ml-auto" onClick={() => setLayersOpen(true)}><LayersIcon data-icon="inline-start" />{t("geoJson.title")} ({layers.length})</Button>
      </div>

      {(mode !== "none" || moving) && (
        <div className="flex items-center gap-3 rounded-md bg-info-bg px-3 py-1.5 text-sm text-info">
          <span>{moving ? t("popup.moveHint") : t(`draw.hint.${mode}`)}</span>
          {(mode === "polyline" || mode === "polygon") && (
            <Button size="xs" onClick={finish} disabled={draft.length < (mode === "polygon" ? 3 : 2)}><CheckIcon data-icon="inline-start" />{t("draw.finish")}</Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => { reset(); setMoving(null); }}><XIcon data-icon="inline-start" />{tg("actions.cancel")}</Button>
        </div>
      )}

      <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-md border">
        <MapContainer ref={setMap} center={[46.6, 2.4]} zoom={6} className="size-full" style={{ minHeight: 400 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
            attribution={`&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ${t("crs")}`} />
          <MapEvents onClick={onMapClick} onMove={setCursor} onDblClick={() => (mode === "polyline" || mode === "polygon") && finish()} />
          {layers.filter((l) => l.visible).map((l) => (
            <GeoJSON key={`${l.id}-${l.color}-${l.locked}`} data={l.data as unknown as GeoJSON.GeoJsonObject} interactive={!l.locked}
              style={{ color: l.color, weight: 2, fillOpacity: 0.15 }}
              pointToLayer={(_f, ll) => L.circleMarker(ll, { radius: 5, color: l.color, fillOpacity: 0.7 })}
              onEachFeature={(f, layer) => { const n = f.properties?.name ?? f.properties?.nom; if (n && !l.locked) layer.bindTooltip(String(n)); }} />
          ))}
          {visible.map((g) => (
            <GeometryLayer key={`${g.id}-${JSON.stringify(g.geojson)}-${g.radius_m}`} geo={g} flow={g.flow_id ? flowById.get(g.flow_id) ?? null : null}
              flows={flows} showLabel={showLabels} focus={focusId === g.id} onFocused={() => setFocusId(null)}
              interactive={mode === "none" && !moving} permissions={permissions} projectId={projectId}
              onMove={() => { map?.closePopup(); setMoving(g.id); }} />
          ))}
          {draft.length > 0 && mode === "polyline" && <Polyline positions={cursor ? [...draft, cursor] : draft} pathOptions={{ dashArray: "6 4", color: DEFAULT_COLOR }} />}
          {draft.length > 0 && mode === "polygon" && <Polygon positions={cursor ? [...draft, cursor] : draft} pathOptions={{ dashArray: "6 4", color: DEFAULT_COLOR }} />}
          {draft.length > 0 && mode === "circle" && cursor && (
            <Circle center={draft[0]} radius={L.latLng(draft[0]).distanceTo(L.latLng(cursor))} pathOptions={{ dashArray: "6 4", color: DEFAULT_COLOR }} />
          )}
        </MapContainer>
      </div>

      <LayersSheet open={layersOpen} onOpenChange={setLayersOpen} projectId={projectId} layers={layers} permissions={permissions} />
    </div>
  );
}

function MapEvents({ onClick, onMove, onDblClick }: { onClick: (ll: LatLng) => void; onMove: (ll: LatLng) => void; onDblClick: () => void }) {
  useMapEvents({
    click: (e) => onClick([e.latlng.lat, e.latlng.lng]),
    mousemove: (e) => onMove([e.latlng.lat, e.latlng.lng]),
    dblclick: () => onDblClick(),
  });
  return null;
}

function GeometryLayer({ geo, flow, flows, showLabel, focus, onFocused, interactive, permissions, projectId, onMove }: {
  geo: Geo; flow: ViewFlow | null; flows: ViewFlow[]; showLabel: boolean; focus: boolean; onFocused: () => void;
  interactive: boolean; permissions: MapCanvasProps["permissions"]; projectId: string; onMove: () => void;
}) {
  const ref = useRef<L.Layer | null>(null);
  const color = geo.color || flow?.status?.color || DEFAULT_COLOR;
  const pts = geoPoints(geo);
  useEffect(() => {
    if (focus && ref.current) { ref.current.openPopup(); onFocused(); }
  }, [focus, onFocused]);
  const inner = (
    <>
      <Popup minWidth={320} maxWidth={360}>
        <GeometryPopup geo={geo} flow={flow} flows={flows} permissions={permissions} projectId={projectId} onMove={onMove} />
      </Popup>
      {showLabel && (geo.label || flow) && (
        <LTooltip permanent direction={geo.kind === "point" ? "top" : "center"} className="!text-xs">{geo.label || flow?.name}</LTooltip>
      )}
    </>
  );
  const path = { color, weight: 3, fillOpacity: 0.2 };
  const common = { ref: (l: L.Layer | null) => { ref.current = l; }, interactive, bubblingMouseEvents: false };
  if (geo.kind === "point") return <Marker position={pts[0]} icon={markerIcon(geo.icon, color)} {...common}>{inner}</Marker>;
  if (geo.kind === "circle") return <Circle center={pts[0]} radius={Number(geo.radius_m ?? 10)} pathOptions={path} {...common}>{inner}</Circle>;
  if (geo.kind === "polyline") return <Polyline positions={pts} pathOptions={path} {...common}>{inner}</Polyline>;
  return <Polygon positions={pts} pathOptions={path} {...common}>{inner}</Polygon>;
}

/** Popup d'une géométrie : onglets Général / Détail, actions Déplacer / Supprimer. */
function GeometryPopup({ geo, flow, flows, permissions, projectId, onMove }: {
  geo: Geo; flow: ViewFlow | null; flows: ViewFlow[]; permissions: MapCanvasProps["permissions"]; projectId: string; onMove: () => void;
}) {
  const t = useTranslations("flowViews.map.popup");
  const tg = useTranslations("global");
  const tf = useTranslations("flows");
  const locale = useLocale();
  const router = useRouter();
  const dialog = useDialog();
  const [pending, start] = useTransition();
  const pts = geoPoints(geo);
  const [lat, lng] = geo.kind === "point" || geo.kind === "circle" ? pts[0] : centroid(pts);
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 6 });
  const [form, setForm] = useState({
    label: geo.label ?? "", icon: geo.icon, flow_id: geo.flow_id, lat: String(lat), lng: String(lng),
    altitude: geo.altitude?.toString() ?? "", radius: geo.radius_m?.toString() ?? "", color: geo.color ?? "",
  });
  const editable = permissions.edit;
  const [tab, setTab] = useState<"general" | "detail">("general");

  const save = () => start(async () => {
    const nlat = Number(form.lat), nlng = Number(form.lng);
    const patch: Partial<GeometryInput> = {
      label: form.label.trim() || null, icon: form.icon, flow_id: form.flow_id,
      altitude: form.altitude ? Number(form.altitude) : null, color: form.color || null,
    };
    if (geo.kind === "circle") patch.radius_m = Number(form.radius) || geo.radius_m;
    if ((geo.kind === "point" || geo.kind === "circle") && Number.isFinite(nlat) && Number.isFinite(nlng) && (nlat !== lat || nlng !== lng)) {
      patch.geojson = { type: "Point", coordinates: [nlng, nlat] };
    }
    const res = await updateGeometry(geo.id, patch);
    if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(tg("toast.saved"));
    router.refresh();
  });
  const remove = () => start(async () => {
    const res = await deleteGeometry(geo.id);
    if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(t("deleted"));
    router.refresh();
  });

  const linked = form.flow_id ? flows.find((f) => f.id === form.flow_id) ?? flow : null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div role="tablist" className="flex rounded-md bg-muted p-0.5">
        {(["general", "detail"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("flex-1 rounded px-2 py-1 text-sm", tab === k ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}>
            {t(k)}
          </button>
        ))}
      </div>
      {tab === "general" && (
        <FieldGroup className="gap-2.5">
          <Field className="gap-1"><FieldLabel htmlFor={`g-label-${geo.id}`}>{t("label")}</FieldLabel>
            <Input id={`g-label-${geo.id}`} value={form.label} disabled={!editable} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
          {geo.kind === "point" && (
            <Field className="gap-1"><FieldLabel>{t("icon")}</FieldLabel>
              <SimpleSelect clearable={false} value={form.icon} disabled={!editable} onChange={(v) => v && setForm({ ...form, icon: v as Icon })}
                options={(Object.keys(ICONS) as Icon[]).map((i) => ({ value: i, label: t(`icons.${i}`) }))} /></Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field className="gap-1"><FieldLabel htmlFor={`g-lat-${geo.id}`}>{t("latitude")}</FieldLabel>
              <Input id={`g-lat-${geo.id}`} value={geo.kind === "point" || geo.kind === "circle" ? form.lat : fmt(lat)} disabled={!editable || (geo.kind !== "point" && geo.kind !== "circle")}
                onChange={(e) => setForm({ ...form, lat: e.target.value })} /></Field>
            <Field className="gap-1"><FieldLabel htmlFor={`g-lng-${geo.id}`}>{t("longitude")}</FieldLabel>
              <Input id={`g-lng-${geo.id}`} value={geo.kind === "point" || geo.kind === "circle" ? form.lng : fmt(lng)} disabled={!editable || (geo.kind !== "point" && geo.kind !== "circle")}
                onChange={(e) => setForm({ ...form, lng: e.target.value })} /></Field>
            <Field className="gap-1"><FieldLabel htmlFor={`g-alt-${geo.id}`}>{t("altitude")}</FieldLabel>
              <Input id={`g-alt-${geo.id}`} type="number" value={form.altitude} disabled={!editable} onChange={(e) => setForm({ ...form, altitude: e.target.value })} /></Field>
            {geo.kind === "circle" ? (
              <Field className="gap-1"><FieldLabel htmlFor={`g-rad-${geo.id}`}>{t("radius")}</FieldLabel>
                <Input id={`g-rad-${geo.id}`} type="number" min={1} value={form.radius} disabled={!editable} onChange={(e) => setForm({ ...form, radius: e.target.value })} /></Field>
            ) : (
              <Field className="gap-1"><FieldLabel htmlFor={`g-col-${geo.id}`}>{t("color")}</FieldLabel>
                <Input id={`g-col-${geo.id}`} type="color" className="h-8 p-1" value={form.color || "#2563eb"} disabled={!editable} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
            )}
          </div>
          <Field className="gap-1"><FieldLabel>{t("linkedFlow")}</FieldLabel>
            <SimpleSelect value={form.flow_id} disabled={!editable} onChange={(v) => setForm({ ...form, flow_id: v })}
              options={flows.map((f) => ({ value: f.id, label: f.ref_int ? `${f.name} (${f.ref_int})` : f.name, color: f.status?.color }))} /></Field>
          <div className="flex flex-wrap gap-2">
            {editable && <Button size="sm" onClick={save} disabled={pending}>{tg("actions.save")}</Button>}
            {editable && <Button size="sm" variant="secondary" onClick={onMove}>{t("move")}</Button>}
            {permissions.delete && <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>{t("delete")}</Button>}
          </div>
        </FieldGroup>
      )}
      {tab === "detail" && (linked ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-muted-foreground">{t("name")}</dt><dd className="font-medium">{linked.name}</dd>
            <dt className="text-muted-foreground">{t("reference")}</dt><dd>{linked.ref_int ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("family")}</dt><dd>{linked.family ? <FamilyChip color={linked.family.color} shortName={linked.family.short_name} longName={linked.family.long_name} /> : "—"}</dd>
            <dt className="text-muted-foreground">{t("category")}</dt><dd>{linked.category?.short_name ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("status")}</dt><dd><StatusBadge color={linked.status?.color} label={linked.status?.name} /></dd>
            <dt className="text-muted-foreground">{tf("columns.type")}</dt><dd>{tf(`types.${linked.flow_type}`)}</dd>
            <dd className="col-span-2 pt-2">
              <Button size="sm" variant="secondary" className="w-full" onClick={() => dialog.open(`flow/edit/${linked.id}/general-tab`)}>{t("openFlow")}</Button>
              <Button size="sm" variant="link" className="w-full" onClick={() => router.push(`/explore/projects/${projectId}/flow/${linked.id}/content-view`)}>{t("openContent")}</Button>
            </dd>
          </dl>
        ) : <p className="text-muted-foreground">{t("noFlow")}</p>)}
    </div>
  );
}
