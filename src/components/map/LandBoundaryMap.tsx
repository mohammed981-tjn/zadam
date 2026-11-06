"use client";

import dynamic from "next/dynamic";
import type { MapOverlay } from "./LiveMap";

/** The live map, fetched only on a land that has a drawn boundary. */
const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false });

/**
 * حدود الأرض كما رسمها صاحبها في التطبيق، على صورة الأقمار (البند ١٣٤).
 *
 * The corners are stored [lat, lng] (20261031010000); GeoJSON wants [lng, lat] and a closed ring. The map opens on
 * the field itself, with a margin, rather than on the whole country.
 */
export default function LandBoundaryMap({ boundary, label }: { boundary: [number, number][]; label: string }) {
  const ring = boundary.map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]);
  const lats = boundary.map(([lat]) => lat);
  const lngs = boundary.map(([, lng]) => lng);
  const pad = 0.002;
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lngs) - pad, Math.min(...lats) - pad],
    [Math.max(...lngs) + pad, Math.max(...lats) + pad],
  ];
  const overlays: MapOverlay[] = [
    {
      kind: "fill",
      id: "land-boundary",
      data: {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { title: label }, geometry: { type: "Polygon", coordinates: [ring] } }],
      },
      color: "#1f7a3d",
      opacity: 0.25,
      outline: "#ffffff",
    },
  ];
  return <LiveMap overlays={overlays} bounds={bounds} initialGround="sat" className="h-72" padding={24} />;
}
