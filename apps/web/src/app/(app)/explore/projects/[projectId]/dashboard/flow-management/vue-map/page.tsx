import { getTranslations } from "next-intl/server";
import { MapView } from "@/features/flow-views/map/map-view";
import { listFlowGeometries, listGeoJsonLayers, listViewFlows } from "@/features/flow-views/queries";
import { FlowViewHeader } from "@/features/flow-views/view-header";
import { getFlowOptions } from "@/features/flows/queries";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("flows");
  return { title: t("views.map") };
}

export default async function FlowViewMapPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/flow-management/vue-map">) {
  const { projectId } = await params;
  const { project, can } = await getProjectContext(projectId);
  const t = await getTranslations("flowViews.map");
  const [flows, geometries, layers, options] = await Promise.all([
    listViewFlows(projectId), listFlowGeometries(projectId), listGeoJsonLayers(projectId), getFlowOptions(projectId),
  ]);
  return (
    <>
      <FlowViewHeader projectId={projectId} projectName={project.designation} view="map" title={t("title")}
        subtitle={t("subtitle", { count: geometries.length })} />
      <MapView
        projectId={projectId}
        flows={flows}
        geometries={geometries}
        layers={layers}
        statuses={options.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        families={options.families.map((f) => ({ id: f.id, short_name: f.short_name, color: f.color }))}
        permissions={{ add: can("FlowManagementMap", "add"), edit: can("FlowManagementMap", "edit"), delete: can("FlowManagementMap", "delete") }}
      />
    </>
  );
}
