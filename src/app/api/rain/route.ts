import { NextResponse } from "next/server";
import { ROUTE } from "@/lib/arcCanal";
import { BASE, NEIGHBOUR_LABELS, classRegions, isobands, townValues } from "@/lib/mapDraw";
import {
  CELL_DEG,
  MAP_TOWNS,
  SUDAN_BORDER,
  availableLayers,
  fetchDailyTable,
  fetchRainGrid,
} from "@/lib/rainMap";

/**
 * The rain map and the day-by-day table as data, for the mobile app.
 *
 * The app draws the same map as /rain, and it reads it from here rather than
 * calling Open-Meteo itself so there is one grid, one border, one set of
 * layers and colour bands. Change a band on the website and the app follows;
 * and every phone shares the site's cached requests instead of spending the
 * free tier one install at a time.
 *
 * Colours that are CSS variables (the "no rain" band is the card colour) go
 * out as null — a variable means nothing to Flutter, and the app paints them
 * its own card colour for the same reason the site does. A layer with no
 * values at all (elevation that could not be read, soil before its survey)
 * is left out; the lands layer always goes, empty or not, as on the site.
 * `numbers: false` marks a layer whose value is a class (soil) — the app
 * colours it and writes nothing in the cell.
 *
 * Since the maps were redrawn (backlog #45) it also sends what the website
 * draws them from, so the app draws the same map rather than its own: the
 * ground (`base`, `neighbourLabels`), each layer's smooth bands as polygons
 * in lon/lat (`shapes`: `base` is the band that fills the country, then each
 * higher band's area drawn over it), and the value at each labelled town.
 * The cells stay, for app versions from before.
 */
export async function GET() {
  const [grid, table] = await Promise.all([fetchRainGrid({ lands: true }), fetchDailyTable()]);
  if (!grid) {
    return NextResponse.json(
      { error: "تعذّر جلبُ التوقّع الآن. أعد المحاولة بعد قليل." },
      { status: 503 },
    );
  }

  const hex = (c: string) => (c.startsWith("#") ? c : null);
  const layers = availableLayers(grid);

  return NextResponse.json(
    {
      from: grid.from,
      to: grid.to,
      cellDeg: CELL_DEG,
      border: SUDAN_BORDER,
      towns: MAP_TOWNS,
      canalRoute: ROUTE.map((p) => [p.lon, p.lat]),
      base: { frame: BASE.frame, neighbours: BASE.neighbours, rivers: BASE.rivers, lakes: BASE.lakes, states: BASE.states },
      neighbourLabels: NEIGHBOUR_LABELS,
      layers: layers.map((l) => ({
        key: l.key,
        title: l.title,
        note: l.note,
        unit: l.unit,
        numbers: l.numbers !== false,
        shapes: l.key === "soil" ? classRegions(grid.cells) : l.key === "lands" ? null : isobands(grid.cells, l),
        towns: townValues(grid.cells, l).map((t) => ({ ...t, value: t.value == null ? null : Math.round(t.value * 10) / 10 })),
        bands: l.bands.map((b) => ({
          min: b.min,
          label: b.label,
          fill: hex(b.fill),
          ink: hex(b.ink),
        })),
      })),
      cells: grid.cells.map((c) => ({
        lon: c.lon,
        lat: c.lat,
        pLon: c.pLon,
        pLat: c.pLat,
        labelled: c.labelled,
        values: Object.fromEntries(layers.map((l) => [l.key, l.value(c)])),
      })),
      daily: table && {
        dates: table.dates,
        towns: table.towns.map((t) => ({
          name: t.name,
          days: t.days.map((d) => ({ date: d.date, rainMm: d.rainMm, tmaxC: d.tmaxC })),
        })),
      },
    },
    {
      headers: {
        "cache-control": "public, s-maxage=10800, stale-while-revalidate=3600",
      },
    },
  );
}
