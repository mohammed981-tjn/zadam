/**
 * Emits the geometry rows migration from the measurements in src/lib/arcCanal.ts.
 *
 * WHY GENERATED AND NOT TYPED
 *
 * The same 41 elevations now exist in two places: the module the charts render
 * from, and the table the assistant and any future query read from. Two copies
 * of a measurement drift, and a long-section drawn from one set of numbers
 * beside a table answering from another is worse than having neither.
 *
 * So this file is the only way that migration is written, and verify-arc-canal
 * re-runs it and compares the output byte for byte with what is on disk. Change
 * a measurement in the module and the check fails until the migration is
 * regenerated:
 *
 *   npx tsx scripts/emit-arc-canal-geometry.ts > supabase/migrations/20260819100100_arc_canal_geometry_rows.sql
 *
 * Only ever append a *new* migration when the rows change on a database that
 * has already run this one — editing an applied migration changes nothing
 * downstream.
 */
import {
  ROUTE,
  WHITE_NILE,
  BLUE_NILE,
  MAIN_NILE,
  SARURAB_TRANSECT,
  distanceKm,
} from "../src/lib/arcCanal";

type Row = {
  feature: string;
  seq: number;
  lat: number | null;
  lon: number | null;
  elevation: number | null;
  distance: number | null;
  source: string;
};

const SRTM = "SRTM 30 m (OpenTopoData)";
const OSM = "OpenStreetMap contributors (ODbL)";

const rows: Row[] = [
  ...ROUTE.map((p) => ({
    feature: "route",
    seq: p.index,
    lat: p.lat,
    lon: p.lon,
    elevation: p.elevation,
    distance: Number(distanceKm(p.index).toFixed(3)),
    source: SRTM,
  })),
  ...(
    [
      ["white_nile", WHITE_NILE],
      ["blue_nile", BLUE_NILE],
      ["main_nile", MAIN_NILE],
    ] as const
  ).flatMap(([feature, pts]) =>
    pts.map((p, i) => ({
      feature,
      seq: i,
      lat: p.lat,
      lon: p.lon,
      elevation: null,
      distance: null,
      source: OSM,
    })),
  ),
  // The transect was sampled by distance west of the river at Sarurab, and the
  // coordinates of each sample were not kept. Recording a reconstructed
  // longitude would present arithmetic as a measurement, so the columns stay
  // null and the distance carries the position.
  ...SARURAB_TRANSECT.map((t, i) => ({
    feature: "sarurab_transect",
    seq: i,
    lat: null,
    lon: null,
    elevation: t.elevation,
    distance: t.kmWestOfNile,
    source: SRTM,
  })),
];

const sql = (v: number | null) => (v === null ? "null" : String(v));

const header = `-- إحداثيات القناة القوسية ومنسوبها — من القياس إلى الجدول.
--
-- GENERATED FILE. Do not edit by hand.
--   npx tsx scripts/emit-arc-canal-geometry.ts
-- verify-arc-canal re-runs the generator and fails if this file has drifted
-- from the measurements in src/lib/arcCanal.ts.
--
-- ${rows.length} rows: the ${ROUTE.length} alignment samples with their elevations and
-- chainage, the three river polylines the plan map is drawn over, and the
-- Sarurab transect that refuted a claim this platform had published.

insert into public.arc_canal_geometry
  (feature, seq, lat, lon, elevation_m, distance_km, source)
values`;

const values = rows
  .map(
    (r) =>
      `  ('${r.feature}', ${r.seq}, ${sql(r.lat)}, ${sql(r.lon)}, ` +
      `${sql(r.elevation)}, ${sql(r.distance)}, '${r.source}')`,
  )
  .join(",\n");

export const GEOMETRY_SQL = `${header}\n${values}\non conflict (feature, seq) do nothing;\n`;

if (process.argv[1]?.endsWith("emit-arc-canal-geometry.ts")) {
  process.stdout.write(GEOMETRY_SQL);
}
