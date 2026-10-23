"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/spinner";
import type { MapCanvasProps } from "./map-canvas";

/** Leaflet n'est chargé que côté navigateur (pas de SSR). */
const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <div className="flex flex-1 items-center justify-center rounded-md border"><Spinner /></div>,
});

export function MapView(props: MapCanvasProps) {
  return <MapCanvas {...props} />;
}
