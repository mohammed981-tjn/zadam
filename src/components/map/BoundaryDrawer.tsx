"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapOverlay } from "./LiveMap";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { MAX_CORNERS, boundaryOf, type Boundary, type Corner } from "@/lib/landInput";

/** The live map, fetched only when the farmer opens the drawer. */
const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false });

/** Metres between two corners (haversine): a walk keeps a reading only once the phone has moved this far. */
function metres(a: Corner, b: Corner) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const STEP_M = 5;
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * «حدّد أرضك» في الموقع، كما في التطبيق (البند ١٣٤؛ المالك، 9 نوفمبر 2026: «وضع النقاط على الخريطة في الويب
 * سايت عندما يقوم المزارع باختيار أرضه، لأنّه موجود في التطبيق»).
 *
 * The farmer taps the field's corners in order on the satellite image, or walks round it with the phone's GPS
 * (a reading kept every 5 m, as the app keeps them). The area and the centre are worked out with `boundaryOf`, the
 * same arithmetic the server repeats before it saves; the corners go to the form as `boundary`, a JSON list of
 * {lat, lng}. The server never trusts the area shown here: it computes its own from the corners it receives.
 */
export default function BoundaryDrawer({
  onShape,
  start,
}: {
  /** The shape as it is drawn, or null while it encloses nothing. */
  onShape?: (shape: Boundary | null, corners: Corner[]) => void;
  /** Where the map opens, [lng, lat], when a place is already known. */
  start?: [number, number] | null;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [corners, setCorners] = useState<Corner[]>([]);
  const [walking, setWalking] = useState(false);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const shape = useMemo(() => boundaryOf(corners), [corners]);

  const onShapeRef = useRef(onShape);
  useEffect(() => {
    onShapeRef.current = onShape;
  });
  useEffect(() => {
    onShapeRef.current?.(shape, corners);
  }, [shape, corners]);

  // Stop the GPS when the drawer goes away.
  useEffect(
    () => () => {
      if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    },
    [],
  );

  const add = (c: Corner) =>
    setCorners((cs) => (cs.length >= MAX_CORNERS ? cs : [...cs, { lat: round6(c.lat), lng: round6(c.lng) }]));

  function startWalk() {
    if (!("geolocation" in navigator)) {
      setGpsNote(t("هذا المتصفّح لا يقرأ الموقع. انقر الأركان على الخريطة.", "This browser cannot read the location. Tap the corners on the map."));
      return;
    }
    setGpsNote(t("امشِ حول الأرض على حدودها، ثمّ اضغط «أوقف المشي».", "Walk round the land along its edge, then press «Stop walking»."));
    setWalking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setCorners((cs) =>
          cs.length >= MAX_CORNERS || (cs.length && metres(cs[cs.length - 1], next) < STEP_M)
            ? cs
            : [...cs, { lat: round6(next.lat), lng: round6(next.lng) }],
        );
      },
      () => {
        setGpsNote(t("تعذّرت قراءة الموقع. اسمح للمتصفّح بالموقع، أو انقر الأركان على الخريطة.", "Could not read the location. Allow the browser to use it, or tap the corners on the map."));
        stopWalk();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }

  function stopWalk() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setWalking(false);
  }

  const overlays = useMemo<MapOverlay[]>(() => {
    if (!corners.length) return [];
    const pts = corners.map((c) => [c.lng, c.lat]);
    const list: MapOverlay[] = [];
    if (corners.length >= 3) {
      list.push({
        kind: "fill",
        id: "draw-area",
        data: {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] } }],
        },
        color: "#fec247",
        opacity: 0.25,
      });
    }
    if (corners.length >= 2) {
      list.push({
        kind: "line",
        id: "draw-edge",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: corners.length >= 3 ? [...pts, pts[0]] : pts },
            },
          ],
        },
        color: "#fec247",
        width: 3,
      });
    }
    // Every corner a dot while there are few; a walk's hundreds of readings would only bury the line.
    if (corners.length <= 60) {
      list.push({
        kind: "points",
        id: "draw-corners",
        data: {
          type: "FeatureCollection",
          features: pts.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } })),
        },
        color: "#023f24",
        radius: 6,
      });
    }
    return list;
  }, [corners]);

  const btn =
    "rounded-full border border-border px-3 py-1.5 text-xs font-bold transition hover:border-primary hover:text-primary disabled:opacity-40";
  const feddanText = shape ? (Math.round(shape.feddans * 100) / 100).toLocaleString(locale === "en" ? "en-US" : "ar-SA") : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-6 text-muted">
        {t(
          "انقر أركان أرضك بالترتيب حولها على صورة القمر الصناعيّ (ثلاثة على الأقلّ)، أو اضغط «امشِ حول الأرض» وأنت فيها بالجوّال. تُحسب المساحة والموقع من الأركان.",
          "Tap your land's corners in order round it on the satellite image (three at least), or press «Walk round the land» while you are on it with your phone. The area and the place are worked out from the corners.",
        )}
      </p>
      <LiveMap
        className="h-96"
        initialGround="sat"
        {...(corners.length
          ? { center: [corners[corners.length - 1].lng, corners[corners.length - 1].lat] as [number, number], zoom: 15 }
          : start
            ? { center: start, zoom: 14 }
            : {})}
        overlays={overlays}
        onPick={walking ? undefined : ([lng, lat]) => add({ lat, lng })}
      />
      <div className="flex flex-wrap items-center gap-2">
        {walking ? (
          <button type="button" onClick={stopWalk} className={`${btn} border-primary text-primary`}>
            ⏹ {t("أوقف المشي", "Stop walking")}
          </button>
        ) : (
          <button type="button" onClick={startWalk} className={btn}>
            🚶 {t("امشِ حول الأرض", "Walk round the land")}
          </button>
        )}
        <button type="button" onClick={() => setCorners((cs) => cs.slice(0, -1))} disabled={!corners.length || walking} className={btn}>
          ↶ {t("تراجع عن آخر نقطة", "Undo the last point")}
        </button>
        <button type="button" onClick={() => setCorners([])} disabled={!corners.length || walking} className={btn}>
          {t("امسح النقاط", "Clear the points")}
        </button>
        <span className="text-xs text-muted">
          {t(`النقاط: ${corners.length.toLocaleString("ar-SA")}`, `Points: ${corners.length}`)}
        </span>
      </div>
      {gpsNote && <p className="text-xs text-muted">{gpsNote}</p>}
      {shape ? (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-bold text-primary" role="status">
          {t(`المساحة داخل النقاط: ${feddanText} فدان تقريباً`, `Area inside the points: about ${feddanText} feddans`)}
        </p>
      ) : corners.length > 0 ? (
        <p className="text-xs text-muted" role="status">
          {t("أضف نقاطاً حتى تحيط بالأرض (ثلاث على الأقلّ).", "Add points until they enclose the land (three at least).")}
        </p>
      ) : null}
      <input type="hidden" name="boundary" value={shape ? JSON.stringify(corners) : ""} />
    </div>
  );
}
