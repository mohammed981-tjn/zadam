"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";

/**
 * واجهةُ الرئيسيّة: أفلامُ سودجري الثلاثة كبابِ فندقٍ دوّار.
 *
 * The owner, 2 October: all three films on the homepage, none removed; then
 * «اجعل الفيديوهات الثلاثة مثل باب الفندق الدوار، بإصبعك يمكن تغيّر
 * الفيديوهات، ودائماً اجعل ختام كل فيديو شعار سودغري».
 *
 * So the frame turns. Drag it sideways and it follows the finger, rotating
 * about its vertical axis; let go past a fifth of its width and it swings
 * through, and the next film is on its far side. It goes round and round —
 * after the third comes the first again, as a revolving door has no last
 * panel. Each film ends on the Sudagri logo card (the farmer clip had none,
 * so its web copy now carries one), and when a film ends the door turns by
 * itself to the next. After one full round it turns back to the first film
 * and waits for a tap, rather than downloading films for a visitor who has
 * left the tab open. One button per film under the frame, each with its own
 * progress line, turns the door straight to that film.
 *
 * Each film comes in two cuts, chosen by the frame's shape: 4:5 below `sm`
 * (the vertical cut, shots framed on their subject, captions inside), 16:9
 * from `sm` up. Muted to start, as autoplay requires; «بالصوت» turns the
 * narration on and the choice carries across films.
 *
 * A door nobody knows turns is a wall, so the turning shows before anyone
 * touches it (the owner, 2 October: «الزائر لا يعرف… بيّن طرف الصور التالية
 * ليفهم أنها ستدور»): the next and previous films stand at the frame's sides,
 * their edges angled away like the other panels of a revolving door, each a
 * button that turns the door to it; and a few seconds after the first film
 * starts, the door rocks once on its own, as if pushed.
 *
 * The page still scrolls under a finger: the frame claims only horizontal
 * drags (`touch-action: pan-y`), and only once a drag is clearly sideways.
 *
 * On the visit where the full-screen intro (SplashOnce) is showing, the films
 * wait for it to finish (`sudagri:intro-done`), with a ceiling in case the
 * event is lost. A reader who asked for less motion is shown the logo; the
 * door then turns without animation and nothing plays by itself.
 */
const INTRO_WAIT_MAX_MS = 16000;
/** How far the door swings before the next film takes its place. */
const SWING_MS = 260;
const SETTLE_MS = 380;
const NUDGE_AFTER_MS = 2600;

type Film = { key: string; label: string };
const FILMS: Film[] = [
  { key: "film", label: "من السدّ إلى الحقل" },
  { key: "promo", label: "من الماء تبدأ الحياة" },
  { key: "farmer", label: "مزارعٌ من السودان" },
];
const N = FILMS.length;
const wrap = (i: number) => ((i % N) + N) % N;

/** True below `sm`, where the frame is 4:5. The server renders the wide cut. */
const NARROW = "(max-width: 639.98px)";
const subscribe = (on: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const m = window.matchMedia(NARROW);
  m.addEventListener("change", on);
  return () => m.removeEventListener("change", on);
};
const isNarrow = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches;
const prefersCalm = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  /** Set once the programme has started; from then on a new film plays as it mounts. */
  const armed = useRef(false);
  const [idx, setIdx] = useState(0);
  /** Nothing playing: before a tap after one full round, or when playback was refused. */
  const [idle, setIdle] = useState(false);
  /** The reader asked for less motion: the logo shows until they choose a film. */
  const [calm, setCalm] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  /** The door's angle in degrees, and whether it is moving under its own power. */
  const [angle, setAngle] = useState(0);
  const [easing, setEasing] = useState<string>("none");
  const drag = useRef<{ x: number; y: number; w: number; on: boolean } | null>(null);
  const turning = useRef(false);
  const tall = useSyncExternalStore(subscribe, isNarrow, () => false);
  const film = FILMS[idx];
  const cut = tall ? "tall" : "wide";
  const base = `/video/${film.key}-${cut}`;
  const next = FILMS[wrap(idx + 1)];
  const prev = FILMS[wrap(idx - 1)];

  // Start the programme: now, or once the full-screen intro has finished.
  useEffect(() => {
    let cap = 0;
    const nudge: number[] = [];
    const start = () => {
      window.clearTimeout(cap);
      const v = ref.current;
      if (!v) return;
      if (prefersCalm()) {
        setCalm(true);
        setIdle(true);
        return;
      }
      armed.current = true;
      v.load();
      v.play().catch(() => setIdle(true));
      // The door rocks once on its own, so a visitor sees that it turns.
      nudge.push(
        window.setTimeout(() => {
          if (turning.current || drag.current) return;
          setEasing("transform 420ms ease-in-out");
          setAngle(18);
        }, NUDGE_AFTER_MS),
        window.setTimeout(() => {
          if (turning.current || drag.current) return;
          setAngle(-6);
        }, NUDGE_AFTER_MS + 420),
        window.setTimeout(() => {
          if (turning.current || drag.current) return;
          setEasing(`transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)`);
          setAngle(0);
        }, NUDGE_AFTER_MS + 840),
      );
    };
    // After every mount effect has run, so SplashOnce has set `data-intro`.
    const t = window.setTimeout(() => {
      if (document.documentElement.dataset.intro === "1") {
        window.addEventListener("sudagri:intro-done", start, { once: true });
        cap = window.setTimeout(start, INTRO_WAIT_MAX_MS);
      } else {
        start();
      }
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(cap);
      nudge.forEach((n) => window.clearTimeout(n));
      window.removeEventListener("sudagri:intro-done", start);
    };
  }, []);

  // A new film (or a new cut when the frame changes shape) plays as it mounts.
  useEffect(() => {
    if (!armed.current) return;
    const v = ref.current;
    if (!v) return;
    v.load();
    v.play().catch(() => setIdle(true));
  }, [idx, tall]);

  /**
   * Turn the door to film `to`. `dir` is the way it swings: +1 or −1. The
   * leaving panel swings out to ±90°, the film changes while the door is
   * edge-on, and the new panel swings in from ∓90° to rest.
   */
  const turnTo = (to: number, dir: 1 | -1, play = true) => {
    if (turning.current) return;
    armed.current = play;
    setIdle(!play);
    if (prefersCalm()) {
      setAngle(0);
      setProgress(0);
      setIdx(wrap(to));
      return;
    }
    turning.current = true;
    setEasing(`transform ${SWING_MS}ms ease-in`);
    setAngle(dir * 90);
    window.setTimeout(() => {
      setEasing("none");
      setAngle(-dir * 90);
      setProgress(0);
      setIdx(wrap(to));
      // Two frames so the jump to the far edge is painted before the swing in.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setEasing(`transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)`);
          setAngle(0);
          window.setTimeout(() => (turning.current = false), SETTLE_MS);
        }),
      );
    }, SWING_MS);
  };

  const go = (i: number) => {
    if (i === idx) {
      const v = ref.current;
      if (!v) return;
      armed.current = true;
      setIdle(false);
      v.currentTime = 0;
      v.play().catch(() => setIdle(true));
      return;
    }
    turnTo(i, i > idx ? 1 : -1);
  };

  // ── the finger on the door ──
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (turning.current || (e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, w: e.currentTarget.clientWidth, on: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      d.on = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setEasing("none");
    }
    setAngle(Math.max(-80, Math.min(80, (dx / d.w) * 110)));
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > d.w * 0.2) {
      // In a right-to-left page the next panel waits on the left: pull it in by dragging right.
      turnTo(dx > 0 ? idx + 1 : idx - 1, dx > 0 ? 1 : -1);
    } else {
      setEasing(`transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)`);
      setAngle(0);
    }
  };

  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div>
      <div className="relative" style={{ perspective: "1400px" }}>
        {/*
          The neighbouring panels of the door: the next film on the left (in a
          right-to-left page the next waits on the left), the previous on the
          right, their outer edges turned away behind the frame.
        */}
        {[
          { f: next, side: "left", dir: 1 as const, to: idx + 1, label: "الفيلم التالي", arrow: "‹" },
          { f: prev, side: "right", dir: -1 as const, to: idx - 1, label: "الفيلم السابق", arrow: "›" },
        ].map((p) => (
          <button
            key={p.side}
            type="button"
            onClick={() => turnTo(p.to, p.dir)}
            aria-label={`${p.label}: ${p.f.label}`}
            className={`absolute inset-y-[8%] z-0 w-[15%] overflow-hidden rounded-2xl shadow-card sm:w-[10%] ${
              p.side === "left" ? "left-0" : "right-0"
            }`}
            style={{
              transform: p.side === "left" ? "rotateY(-30deg)" : "rotateY(30deg)",
              transformOrigin: p.side === "left" ? "right center" : "left center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a poster frame, already sized for the web */}
            <img src={`/video/${p.f.key}-${cut}.jpg`} alt="" className="h-full w-full object-cover brightness-75" />
            <span
              className={`absolute inset-y-0 flex items-center px-1 text-2xl font-bold text-white drop-shadow ${
                p.side === "left" ? "left-0" : "right-0"
              }`}
            >
              {p.arrow}
            </span>
          </button>
        ))}
        <figure
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative z-10 mx-auto w-[74%] cursor-grab touch-pan-y select-none overflow-hidden rounded-3xl bg-card shadow-float active:cursor-grabbing sm:w-[84%]"
          style={{
            transform: `rotateY(${angle}deg)`,
            transition: easing,
            // The far face of a turning door is the next film, not a mirror of this one.
            backfaceVisibility: "hidden",
          }}
        >
          <video
            key={base}
            ref={ref}
            muted={muted}
            playsInline
            preload="none"
            poster={`${base}.jpg`}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(Math.round((v.currentTime / v.duration) * 100) / 100);
            }}
            onEnded={() => {
              setProgress(1);
              // Every film ends on the logo card; hold it a moment, then the door turns on —
              // and after the last, back to the first, to wait for a tap.
              const last = idx === N - 1;
              window.setTimeout(() => turnTo(idx + 1, 1, !last), 1200);
            }}
            draggable={false}
            className="pointer-events-none aspect-[4/5] w-full object-cover sm:aspect-video"
            aria-label={`فيلم سودجري: ${film.label}`}
          >
            {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
            <source src={`${base}.webm`} type="video/webm" />
            <source src={`${base}.mp4`} type="video/mp4" />
          </video>

          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={!muted}
            className="absolute bottom-3 left-3 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-medium shadow-card transition hover:border-primary"
          >
            {muted ? "🔊 بالصوت" : "🔇 بلا صوت"}
          </button>

          {/* Less motion asked for: the logo until a film is chosen. */}
          <div
            className={`mesh absolute inset-0 flex items-center justify-center bg-background transition-opacity duration-700 ${
              calm && idle ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <Image
              src={SUDAGRI_LOGO}
              alt="شعار سودجري — منصّة سودانية للزراعة والتجارة"
              placeholder="blur"
              sizes="(min-width: 768px) 420px, 70vw"
              className="h-[90%] w-auto object-contain"
            />
          </div>

          {idle && (
            <button
              type="button"
              onClick={() => go(idx)}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card/90 px-6 py-3 text-base font-bold shadow-float transition hover:border-primary"
            >
              ▶ شاهد
            </button>
          )}
        </figure>
      </div>

      <p className="mt-2 text-center text-xs text-muted">
        ↔ اسحب أو اضغط طرف الفيلم المجاور ليدور الباب
      </p>

      {/* One button per film, each with its own progress line. */}
      <nav aria-label="أفلام سودجري" className="mt-2 grid grid-cols-3 gap-2">
        {FILMS.map((f, i) => {
          const active = i === idx;
          const fill = active ? progress : 0;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => go(i)}
              aria-current={active ? "true" : undefined}
              className={`relative overflow-hidden rounded-xl border px-2 py-2 text-center text-xs font-medium leading-snug transition sm:text-sm ${
                active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted hover:border-primary"
              }`}
            >
              <span className="block truncate">
                {active ? "▶ " : ""}
                {f.label}
              </span>
              <span
                aria-hidden
                className="absolute bottom-0 right-0 h-1 bg-primary transition-[width] duration-300"
                style={{ width: `${fill * 100}%` }}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
