"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

/** The drawing space every signature is stored in, whatever the screen. */
const W = 600;
const H = 200;

/**
 * A signature drawn with a finger (backlog 127: «ابنِ توقيعاً»).
 *
 * The strokes are kept as an SVG path in a fixed 600×200 space — move and line
 * commands and whole numbers only — so the database can check its shape
 * (`signature ~ '^[ML0-9 .-]+$'`) and the page can draw it back at any size
 * without ever rendering anything the signer did not draw.
 */
export default function SignaturePad({ name = "signature" }: { name?: string }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [path, setPath] = useState("");
  const [points, setPoints] = useState(0);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * W),
      y: Math.round(((e.clientY - r.top) / r.height) * H),
    };
  };

  const redraw = useCallback((d: string) => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const ratio = c.width / W;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 3 * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(c).color;
    ctx.stroke(new Path2D(d.split(/(?=[ML])/).map((s) => {
      const [cmd, x, y] = s.trim().split(" ");
      return `${cmd} ${Number(x) * ratio} ${Number(y) * ratio}`;
    }).join(" ")));
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round((c.clientWidth * dpr * H) / W);
      redraw(path);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [path, redraw]);

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    setPath((d) => `${d}${d ? " " : ""}M ${p.x} ${p.y}`);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = pos(e);
    setPoints((n) => n + 1);
    setPath((d) => `${d} L ${p.x} ${p.y}`);
  };
  const end = () => {
    drawing.current = false;
  };

  const ready = points >= 8;

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-white ring-2 ring-primary/40">
        <canvas
          ref={canvas}
          aria-label={t("مربّع التوقيع: ارسم توقيعك بإصبعك", "Signature box: draw your signature with your finger")}
          className="block aspect-[3/1] w-full touch-none text-[#1a1418]"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {!path && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-muted">
            {t("ارسم توقيعك هنا بإصبعك", "Draw your signature here with your finger")}
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-dashed border-border" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={ready ? "font-bold text-leaf" : "text-muted"}>
          {ready ? t("✓ التوقيع جاهز", "✓ Signature ready") : t("التوقيع لم يكتمل بعد", "Signature not complete yet")}
        </span>
        <button
          type="button"
          onClick={() => {
            setPoints(0);
            setPath("");
          }}
          className="font-bold text-primary underline"
        >
          {t("امسح وأعد", "Clear and redo")}
        </button>
      </div>
      <input type="hidden" name={name} value={ready ? path : ""} />
    </div>
  );
}
