import type { StyleSpecification, LayerSpecification, GeoJSONSourceSpecification } from "maplibre-gl";
import { HALAIB_BORDER } from "@/lib/rainMap";

/**
 * مثلث حلايب داخل السودان، بلا خطٍّ يفصله عنه (البند ١٧٤).
 *
 * The owner, 24 October: «امسح الحدود المتنازع عليها … وأضِف الحدود إلى السودان وامسح الخطّ
 * الفاصل الذي يفصل حلايب عن السودان». OpenFreeMap's tiles carry the triangle as lines with
 * disputed = 1 and a disputed_name that names it («السودان-مثلثحلايب», claimed_by EG), and the
 * style draws them dashed along 22°N. So: the style's disputed layer skips every line whose
 * name has «حلايب» (every other disputed line, Bir Tawil and the rest of the world, is
 * unchanged), and Sudan's border round the triangle is drawn in the same colour and width as
 * the style's own country border, from the polygon the platform's other maps already use
 * (SUDAN_BORDER in rainMap.ts, with the triangle inside since 24 September).
 *
 * Read from a real tile on 24 October (.github/workflows/map-sources.yml keeps proving it):
 * lines carry admin_level, adm0_l and adm0_r (ISO codes), disputed, disputed_name, claimed_by.
 */
export function withHalaibInSudan(style: StyleSpecification): StyleSpecification {
  const name = ["to-string", ["coalesce", ["get", "disputed_name"], ""]];
  const notHalaib = ["all", ["!", ["in", "حلايب", name]], ["!", ["in", "حلائب", name]]];
  const isDisputed = (l: LayerSpecification) =>
    l.type === "line" && JSON.stringify((l as { filter?: unknown }).filter ?? "").includes('["==",["get","disputed"],1]');
  const border = style.layers.find((l) => l.id === "boundary_2");
  const layers: LayerSpecification[] = [];
  let drawn = false;
  for (const l of style.layers) {
    if (isDisputed(l)) {
      if (!drawn) {
        layers.push({
          id: "boundary_sudan_halaib",
          type: "line",
          source: "sudan_halaib",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: (border?.paint as never) ?? { "line-color": "hsl(248,1%,41%)", "line-width": 1.2 },
        } as LayerSpecification);
        drawn = true;
      }
      const filter = (l as { filter?: unknown }).filter;
      layers.push({ ...l, filter: filter ? ["all", filter, notHalaib] : notHalaib } as LayerSpecification);
    } else {
      layers.push(l);
    }
  }
  if (!drawn) return style;
  return {
    ...style,
    sources: {
      ...style.sources,
      sudan_halaib: {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: HALAIB_BORDER.map((p) => [...p]) } },
      } as GeoJSONSourceSpecification,
    },
    layers,
  };
}
