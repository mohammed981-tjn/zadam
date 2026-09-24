import { NextResponse } from "next/server";
import {
  CELL_DEG,
  RAIN_BANDS,
  SUDAN_BORDER,
  fetchRainGrid,
} from "@/lib/rainMap";

/**
 * The rain map as data, for the mobile app.
 *
 * The app draws the same map as /rain, and it reads it from here rather than
 * calling Open-Meteo itself so there is one grid, one border and one set of
 * colour bands. Change a band on the website and the app follows; and every
 * phone shares the site's three-hour cached request instead of spending the
 * free tier one install at a time.
 *
 * Bands whose colour is the theme's card colour go out as null — a CSS
 * variable means nothing to Flutter, and the app paints them its own card
 * colour for the same reason the site does.
 */
export async function GET() {
  const grid = await fetchRainGrid();
  if (!grid) {
    return NextResponse.json(
      { error: "تعذّر جلبُ التوقّع الآن. أعد المحاولة بعد قليل." },
      { status: 503 },
    );
  }

  const hex = (c: string) => (c.startsWith("#") ? c : null);

  return NextResponse.json(
    {
      from: grid.from,
      to: grid.to,
      cellDeg: CELL_DEG,
      border: SUDAN_BORDER,
      bands: RAIN_BANDS.map((b) => ({
        min: b.min,
        label: b.label,
        fill: hex(b.fill),
        ink: hex(b.ink),
      })),
      cells: grid.cells,
    },
    {
      headers: {
        "cache-control": "public, s-maxage=10800, stale-while-revalidate=3600",
      },
    },
  );
}
