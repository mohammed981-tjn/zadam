"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Map as MLMap, StyleSpecification, LayerSpecification, GeoJSONSourceSpecification } from "maplibre-gl";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { withHalaibInSudan } from "@/lib/mapStyle";

/**
 * خريطةٌ حيّة بطبقتين يُبدَّل بينهما بلمسة: الخريطة العاديّة، والقمر الصناعيّ (البند ١٤٧).
 *
 * The owner, 23 October: «خريطتان يمكن تغييرهما: أقمارٌ اصطناعيّة أو الأخرى، مثل خرائط
 * تطبيقات التوصيل، وتكون إبداعيّة، وستغيّر جميع الخرائط». So one component, used for
 * every map, with the controls a delivery app has: a round button to switch
 * the ground, «موقعي», and zoom, floating over the map; a tap on something
 * opens a card at the bottom.
 *
 * WHERE THE GROUND COMES FROM — both free for a commercial site, read on 23
 * October:
 *   - the map: OpenFreeMap («Is commercial usage allowed? Yes»; no key, no
 *     limit; attribution added by MapLibre), the «liberty» style, its labels
 *     switched to Arabic names where the data has them;
 *   - the satellite: EOxCloudless 2016 (CC BY 4.0: «Commercial apps may access
 *     the free 2016 endpoint under CC BY 4.0, provided traffic is reasonable»),
 *     a Sentinel-2 mosaic at 10 m — fields and canals, not houses. The later
 *     years are not free for commercial use. Place and road labels from the
 *     map are laid over it, as a delivery app does.
 *
 * MapLibre 6 shapes Arabic itself, so no right-to-left plugin is loaded.
 * The library (about a megabyte) is imported only when a map mounts, so pages
 * without one never fetch it — and imported as it ships, from the files
 * scripts/vendor-maplibre.mjs copies into public/vendor/maplibre, not through
 * the bundler: bundled, it looks for its worker beside the bundle and the map
 * never draws.
 */

type ML = typeof import("maplibre-gl");
const LIBRARY = "/vendor/maplibre/maplibre-gl.mjs";
let library: Promise<ML> | null = null;
const maplibre = () => (library ??= import(/* webpackIgnore: true */ LIBRARY) as Promise<ML>);

export const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// The 2016 mosaic's layer is «s2cloudless_3857», with no year: the years
// in the name (s2cloudless-2018_3857 and on) are the non-commercial ones.
// Proved by .github/workflows/map-sources.yml, which found the first guess
// at the name answering 404 (24 October).
const SAT_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
const SAT_ATTRIBUTION =
  '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017)';

/** Sudan as the map first shows it. */
export const SUDAN_BOUNDS: [[number, number], [number, number]] = [
  [21.8, 8.6],
  [38.7, 22.3],
];

export type Ground = "map" | "sat";

/**
 * What a page draws over the ground. Each id is unique on the map. Colours
 * and widths may be MapLibre expressions (["get", "colour"]), read from each
 * feature. A fill marked `under` goes beneath the water, roads and names, so
 * a coloured band never hides the Nile or a town's name.
 * Pins are not drawn by MapLibre but laid over it, as a delivery app lays
 * its price tags: they take the page's own font, Arabic included.
 */
export type MapOverlay =
  | {
      kind: "fill";
      id: string;
      data: GeoJSON.FeatureCollection;
      color: unknown;
      opacity?: number;
      outline?: string;
      under?: boolean;
    }
  | { kind: "line"; id: string; data: GeoJSON.FeatureCollection; color: unknown; width?: unknown; dash?: number[] }
  | { kind: "points"; id: string; data: GeoJSON.FeatureCollection; color: unknown; radius?: number; stroke?: string }
  | { kind: "pins"; id: string; pins: MapPin[]; tone?: "plain" | "green" };

/** A tag on the map: its value, the place's name (shown when close), and what its card says when tapped. */
export type MapPin = { lon: number; lat: number; text: string; name?: string; title?: string; detail?: string };

/** A feature's `title` and `detail` properties are what its card shows. */
export type Picked = { title: string; detail?: string; lonLat: [number, number] };

let styleCache: StyleSpecification | null = null;
async function streetStyle(): Promise<StyleSpecification> {
  if (!styleCache) styleCache = withHalaibInSudan((await (await fetch(STREET_STYLE)).json()) as StyleSpecification);
  return styleCache;
}

/** The satellite with the map's labels, roads and borders over it. */
function hybrid(street: StyleSpecification): StyleSpecification {
  const keep = (l: LayerSpecification) =>
    l.type === "symbol" || (l.type === "line" && /boundary|road|highway|bridge|tunnel|rail/.test(l.id));
  return {
    ...street,
    sources: {
      ...street.sources,
      // Tiles to zoom 13; closer in, MapLibre enlarges those.
      sat: { type: "raster", tiles: [SAT_TILES], tileSize: 256, maxzoom: 13, attribution: SAT_ATTRIBUTION },
    },
    layers: [
      { id: "sat", type: "raster", source: "sat" },
      ...street.layers.filter(keep).map((l) =>
        l.type === "line" ? ({ ...l, paint: { ...(l.paint ?? {}), "line-opacity": 0.55 } } as LayerSpecification) : l,
      ),
    ],
  };
}

/** Labels in Arabic where the data has them, the local name otherwise. */
function arabicLabels(map: MLMap, locale: string) {
  const field =
    locale === "en"
      ? ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]
      : ["coalesce", ["get", "name:ar"], ["get", "name"]];
  for (const l of map.getStyle().layers ?? []) {
    if (l.type === "symbol" && l.layout && "text-field" in l.layout) {
      map.setLayoutProperty(l.id, "text-field", field as never);
    }
  }
}

/**
 * Where an `under` fill goes: before the first layer of water, roads, borders
 * or names (OpenMapTiles' source layers, which the liberty style and the
 * satellite's kept layers both use).
 */
function firstAbove(map: MLMap): string | undefined {
  return (map.getStyle().layers ?? []).find(
    (l) =>
      l.type === "symbol" ||
      ("source-layer" in l && /^(water|waterway|transportation|boundary)$/.test(String(l["source-layer"]))),
  )?.id;
}

function addOverlays(map: MLMap, overlays: MapOverlay[]) {
  const under = firstAbove(map);
  for (const o of overlays) {
    if (o.kind === "pins") continue;
    const src = `ov-${o.id}`;
    if (map.getSource(src)) continue;
    map.addSource(src, { type: "geojson", data: o.data } as GeoJSONSourceSpecification);
    if (o.kind === "fill") {
      map.addLayer(
        {
          id: src,
          type: "fill",
          source: src,
          paint: { "fill-color": o.color as never, "fill-opacity": o.opacity ?? 0.55 },
        },
        o.under ? under : undefined,
      );
      if (o.outline) map.addLayer({ id: `${src}-edge`, type: "line", source: src, paint: { "line-color": o.outline, "line-width": 1 } });
    } else if (o.kind === "line") {
      map.addLayer({
        id: src,
        type: "line",
        source: src,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": o.color as never,
          "line-width": (o.width ?? 3) as never,
          ...(o.dash ? { "line-dasharray": o.dash } : {}),
        },
      });
    } else {
      map.addLayer({
        id: src,
        type: "circle",
        source: src,
        paint: {
          "circle-color": o.color as never,
          "circle-radius": o.radius ?? 6,
          "circle-stroke-color": o.stroke ?? "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }
  }
}

/** One empty list, so a map with no overlays is not redrawn on every render. */
const NONE: MapOverlay[] = [];

export default function LiveMap({
  overlays = NONE,
  bounds = SUDAN_BOUNDS,
  center,
  zoom,
  className = "h-[60vh] min-h-80",
  onPick,
  marker,
  children,
  initialGround = "map",
  padding = 16,
}: {
  overlays?: MapOverlay[];
  bounds?: [[number, number], [number, number]];
  center?: [number, number];
  zoom?: number;
  className?: string;
  /** A tap on empty ground: for choosing a place (a land's location). */
  onPick?: (lonLat: [number, number]) => void;
  /** A pin the page controls, such as the place being chosen. */
  marker?: [number, number] | null;
  /** Floating things of the page's own: layer chips, a legend. */
  children?: ReactNode;
  initialGround?: Ground;
  /** Room kept clear of the country on the first view: under the page's chips and key, beside the buttons. */
  padding?: number | { top: number; bottom: number; left: number; right: number };
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const pinRef = useRef<import("maplibre-gl").Marker | null>(null);
  const tagsRef = useRef<import("maplibre-gl").Marker[]>([]);
  const overlaysRef = useRef(overlays);
  const onPickRef = useRef(onPick);
  // False between asking for a new ground and its style arriving: overlays
  // cannot be added then, and «style.load» adds them when it comes.
  const styleReady = useRef(false);
  const [ground, setGround] = useState<Ground>(initialGround);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // What was tapped, with the overlays it was tapped on: a change of layer
  // closes its card without an effect to do it.
  const [tapped, setTapped] = useState<{ on: MapOverlay[]; what: Picked } | null>(null);
  const picked = tapped && tapped.on === overlays ? tapped.what : null;
  const setPicked = (what: Picked | null) => setTapped(what ? { on: overlaysRef.current, what } : null);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    overlaysRef.current = overlays;
    onPickRef.current = onPick;
  });

  // The map itself, once.
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const ml = await maplibre();
        const street = await streetStyle();
        if (gone || !box.current) return;
        const map = new ml.Map({
          container: box.current,
          style: initialGround === "sat" ? hybrid(street) : street,
          ...(center ? { center, zoom: zoom ?? 9 } : { bounds, fitBoundsOptions: { padding } }),
          // The sources' names bottom left: the right edge holds the buttons
          // and the page's key.
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          cooperativeGestures: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new ml.AttributionControl({ compact: true }), "bottom-left");
        mapRef.current = map;
        map.on("style.load", () => {
          styleReady.current = true;
          arabicLabels(map, locale);
          addOverlays(map, overlaysRef.current);
        });
        map.once("load", () => setReady(true));
        // Close enough to read a town's name beside its value (see the tags below).
        const near = () => {
          if (box.current) box.current.dataset.near = map.getZoom() >= 6 ? "1" : "";
        };
        map.on("zoomend", near);
        near();
        map.on("click", (e) => {
          // A tag is a button of its own; its press is not a press on the ground.
          if ((e.originalEvent.target as HTMLElement | null)?.closest?.(".maplibregl-marker")) return;
          const ids = overlaysRef.current.map((o) => `ov-${o.id}`).filter((id) => map.getLayer(id));
          const hit = ids.length
            ? map.queryRenderedFeatures(e.point, { layers: ids }).find((f) => f.properties?.title)
            : undefined;
          if (hit) {
            setPicked({
              title: String(hit.properties.title),
              detail: hit.properties.detail ? String(hit.properties.detail) : undefined,
              lonLat: [e.lngLat.lng, e.lngLat.lat],
            });
          } else {
            setPicked(null);
            onPickRef.current?.([e.lngLat.lng, e.lngLat.lat]);
          }
        });
      } catch (err) {
        console.error("map: could not start", err);
        if (!gone) setFailed(true);
      }
    })();
    return () => {
      gone = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is made once; later changes are applied below
  }, []);

  // A page that changes its overlays (a layer chip): replace them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !styleReady.current) return;
    for (const l of [...(map.getStyle().layers ?? [])]) if (l.id.startsWith("ov-")) map.removeLayer(l.id);
    for (const id of Object.keys(map.getStyle().sources ?? {})) if (id.startsWith("ov-")) map.removeSource(id);
    addOverlays(map, overlays);
  }, [overlays, ready]);

  // The tags: laid over the map, so they stay through a change of ground.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let gone = false;
    (async () => {
      const ml = await maplibre();
      if (gone) return;
      for (const m of tagsRef.current) m.remove();
      tagsRef.current = [];
      for (const o of overlays) {
        if (o.kind !== "pins") continue;
        for (const p of o.pins) {
          const el = document.createElement("button");
          el.type = "button";
          el.dir = locale === "en" ? "ltr" : "rtl";
          if (o.tone === "green") {
            el.className =
              "flex size-9 items-center justify-center rounded-full bg-[#0f5a32] text-sm font-black text-white shadow-float ring-2 ring-white";
          } else {
            // A tag with a point under it. Far out it shows the value alone,
            // so sixteen towns fit a phone; closer in, the town's name too.
            el.className =
              "relative whitespace-nowrap rounded-full bg-card px-2 py-0.5 text-[12px] font-extrabold text-foreground shadow-float ring-1 ring-border after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-[5px] after:border-transparent after:border-t-card";
          }
          if (p.name) {
            const name = document.createElement("span");
            name.className = "hidden font-bold text-muted group-data-[near=1]/map:inline";
            name.textContent = `${p.name} · `;
            el.append(name);
          }
          el.append(p.text);
          el.setAttribute("aria-label", p.title ?? p.text);
          if (p.title) {
            el.addEventListener("click", () => setPicked({ title: p.title!, detail: p.detail, lonLat: [p.lon, p.lat] }));
          }
          tagsRef.current.push(
            new ml.Marker({ element: el, anchor: o.tone === "green" ? "center" : "bottom", offset: [0, o.tone === "green" ? 0 : -5] })
              .setLngLat([p.lon, p.lat])
              .addTo(map),
          );
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, [overlays, ready, locale]);

  // The ground: map or satellite. The overlays come back on «style.load».
  const switchGround = async () => {
    const map = mapRef.current;
    if (!map) return;
    const next: Ground = ground === "map" ? "sat" : "map";
    const street = await streetStyle();
    styleReady.current = false;
    map.setStyle(next === "sat" ? hybrid(street) : street, { diff: false });
    setGround(next);
  };

  // The page's pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (async () => {
      const ml = await maplibre();
      if (!marker) {
        pinRef.current?.remove();
        pinRef.current = null;
        return;
      }
      if (!pinRef.current) pinRef.current = new ml.Marker({ color: "#0f5a32" }).setLngLat(marker).addTo(map);
      else pinRef.current.setLngLat(marker);
    })();
  }, [marker, ready]);

  // «موقعي»: the blue dot, as Google's map and the delivery apps draw it.
  const meRef = useRef<import("maplibre-gl").Marker | null>(null);
  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        const at: [number, number] = [p.coords.longitude, p.coords.latitude];
        if (!meRef.current) {
          const ml = await maplibre();
          const dot = document.createElement("span");
          dot.className = "relative flex size-5";
          dot.setAttribute("aria-label", t("أنت هنا", "You are here"));
          dot.innerHTML =
            '<span class="absolute inline-flex size-full animate-ping rounded-full bg-[#1a73e8] opacity-50 motion-reduce:animate-none"></span>' +
            '<span class="relative inline-flex size-5 rounded-full border-[3px] border-white bg-[#1a73e8] shadow-float"></span>';
          meRef.current = new ml.Marker({ element: dot }).setLngLat(at).addTo(map);
        } else meRef.current.setLngLat(at);
        map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 13) });
        onPickRef.current?.(at);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const round =
    "flex size-12 items-center justify-center rounded-full bg-card/95 text-foreground shadow-float ring-1 ring-border backdrop-blur transition active:scale-95";

  return (
    <div className={`relative overflow-hidden rounded-[1.75rem] bg-border/40 ring-[3px] ring-primary ${className}`} dir="ltr">
      {/* Full size, not absolute: MapLibre's own CSS makes its box relative. */}
      <div ref={box} className="group/map h-full w-full" aria-label={t("خريطة", "Map")} role="region" />

      {!ready && !failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary motion-reduce:animate-none" />
        </div>
      )}
      {failed && (
        <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl bg-card p-4 text-center text-sm" dir="rtl">
          {t("تعذّر تحميل الخريطة الآن. تحقّق من الاتّصال وأعد فتح الصفحة.", "The map could not load just now. Check the connection and reopen the page.")}
        </p>
      )}

      {/* The page's own floating things (chips, legend), in the reading direction. */}
      <div dir={locale === "ar" ? "rtl" : "ltr"} className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto">{children}</div>
      </div>

      {/* The delivery-app controls, on the right edge whatever the language,
          under the page's chips when it has them. */}
      <div className={`absolute right-3 flex flex-col gap-2 ${children ? "top-[4.25rem] md:top-3" : "top-3"}`}>
        <button
          type="button"
          onClick={switchGround}
          aria-pressed={ground === "sat"}
          className="group flex size-14 flex-col items-center justify-end overflow-hidden rounded-2xl text-[11px] font-black text-white shadow-float ring-2 ring-white transition active:scale-95"
          style={{
            background:
              ground === "map"
                ? "linear-gradient(135deg,#2f4a2c,#6b7f3a 45%,#3d5a33 70%,#8a7a52)"
                : "linear-gradient(135deg,#f3ead7,#e8e1cf 50%,#cfe3c6)",
          }}
          aria-label={ground === "map" ? t("قمر صناعي", "Satellite") : t("خريطة", "Map")}
        >
          <span className={`w-full py-0.5 text-center ${ground === "map" ? "bg-black/45" : "bg-primary/85"}`}>
            {ground === "map" ? t("قمر صناعي", "Satellite") : t("خريطة", "Map")}
          </span>
        </button>
        <button type="button" onClick={locate} className={round} aria-label={t("موقعي", "My location")}>
          {locating ? (
            <span className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-primary" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          )}
        </button>
        <button type="button" onClick={() => mapRef.current?.zoomIn()} className={round} aria-label={t("تكبير", "Zoom in")}>
          <span className="text-2xl font-black leading-none">+</span>
        </button>
        <button type="button" onClick={() => mapRef.current?.zoomOut()} className={round} aria-label={t("تصغير", "Zoom out")}>
          <span className="text-2xl font-black leading-none">−</span>
        </button>
      </div>

      {/* What was tapped: a card from the bottom, as a delivery app shows a shop. */}
      {picked && (
        <div dir={locale === "ar" ? "rtl" : "ltr"} className="absolute inset-x-3 bottom-3 rounded-2xl bg-card p-4 shadow-float ring-1 ring-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-black [overflow-wrap:anywhere]">{picked.title}</p>
              {picked.detail && <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">{picked.detail}</p>}
            </div>
            <button type="button" onClick={() => setPicked(null)} className="text-xl leading-none text-muted" aria-label={t("أغلق", "Close")}>
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
