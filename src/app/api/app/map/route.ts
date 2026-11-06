import { NextResponse } from "next/server";
import { mapThemes, mapWeekDates } from "@/lib/mapLayers";
import { GROUND_CREDITS, MAP_SOURCES, SAT_MAX_ZOOM, SAT_TILES, STREET_STYLE } from "@/lib/mapGround";
import { HALAIB_BORDER, availableLayers, fetchRainGrid } from "@/lib/rainMap";
import { appLocale } from "@/lib/appLocale";

/**
 * «الخرائط» في التطبيق (البند ٢٠٣): what /map draws, as data, for the app's full-screen map.
 *
 * The themes are the website's own (mapThemes in src/lib/mapLayers.ts), built from the same week's
 * grid /map reads, in the same order and colours, with the same keys and the same words on each
 * card; the app draws them over the same two grounds (src/lib/mapGround.ts). Change a layer on the
 * website and the app follows.
 *
 * Everything here is public, as on /map, which needs no sign-in: the forecast, the soil and height,
 * the canal, the minerals, the roads and power. Verified lands go out as /map shows them, a count
 * per square of about 167 km at the square's centre, counted inside the database by
 * public_land_cells() over the anon key — no land's own place leaves it. So no session is asked for.
 *
 * When the week's forecast cannot be fetched the fixed layers still go, with `week: false`, and the
 * app says so as the page does.
 *
 * `halaib` is Sudan's border round the Halaib triangle (البند ١٧٤), which the website draws over the
 * street map's tiles in place of their dashed line; the app draws the same line.
 */
export async function GET(req: Request) {
  const locale = appLocale(req);
  const grid = await fetchRainGrid({ lands: true });
  const themes = mapThemes(grid, grid ? availableLayers(grid) : [], locale, mapWeekDates(grid, locale));

  return NextResponse.json(
    {
      week: !!grid,
      from: grid?.from ?? null,
      to: grid?.to ?? null,
      grounds: {
        style: STREET_STYLE,
        sat: SAT_TILES,
        satMaxZoom: SAT_MAX_ZOOM,
        credits: GROUND_CREDITS,
      },
      halaib: HALAIB_BORDER,
      sources: MAP_SOURCES[locale],
      themes,
    },
    {
      headers: {
        // As /api/rain: the grid is cached three hours; a missing week is asked for again sooner.
        "cache-control": grid
          ? "public, s-maxage=10800, stale-while-revalidate=3600"
          : "public, s-maxage=300",
      },
    },
  );
}
