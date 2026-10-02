"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";

/**
 * واجهةُ الرئيسيّة: أفلامُ سودجري الثلاثة، تنزلق كمن ينزلق من زحليقةٍ إلى حوض.
 *
 * The owner, 2 October: all three films on the homepage, none removed, each
 * ending on the Sudagri logo. A sideways revolving door came first; its side
 * panels made the frame narrow, and the owner asked instead for a vertical
 * motion «مثل سقوط الشخص من مزلقة إلى حوض سباحة».
 *
 * So the frame keeps its full width, and under it lies a "pool": a strip
 * showing the next film beneath moving water, labelled «التالي». Drag the frame
 * down (or tap the pool) and it tilts back and slides down the chute, dives
 * into the pool with rings spreading on the water, and the next film rises out
 * of it and settles with a small bounce. Drag up for the previous film. It goes
 * round: after the third comes the first. A few seconds after the first film
 * starts, the frame dips once towards the pool on its own and bobs back, so a
 * visitor sees which way it goes. When a film ends (each on the logo card) it
 * slides on to the next by itself; after one full round it returns to the
 * first and waits for a tap rather than streaming to an idle tab.
 *
 * The frame claims vertical drags (`touch-action: none` on the frame only);
 * the page scrolls from everywhere else, and a drag that is clearly sideways
 * is let go.
 *
 * Each film comes in two cuts, chosen by the frame's shape: 4:5 below `sm`
 * (vertical cut), 16:9 from `sm` up. Muted to start, as autoplay requires;
 * «بالصوت» turns the narration on and the choice carries across films. On the
 * visit where the full-screen intro (SplashOnce) is showing, the films wait for
 * it (`sudagri:intro-done`), with a ceiling. A reader who asked for less
 * motion is shown the logo, and films change without the slide.
 */
const INTRO_WAIT_MAX_MS = 16000;
const DIVE_MS = 420;
const RISE_MS = 620;
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

/** Where the frame is: translateY in % of its height, tilt about X, scale, opacity. */
type Pose = { y: number; rx: number; s: number; o: number };
const REST: Pose = { y: 0, rx: 0, s: 1, o: 1 };

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
  const [pose, setPose] = useState<Pose>(REST);
  const [easing, setEasing] = useState("none");
  /** Bumped to replay the rings on the water. */
  const [splash, setSplash] = useState(0);
  const drag = useRef<{ x: number; y: number; h: number; on: boolean } | null>(null);
  const moving = useRef(false);
  const tall = useSyncExternalStore(subscribe, isNarrow, () => false);
  const film = FILMS[idx];
  const cut = tall ? "tall" : "wide";
  const base = `/video/${film.key}-${cut}`;
  const next = FILMS[wrap(idx + 1)];

  // Start the programme: now, or once the full-screen intro has finished.
  useEffect(() => {
    let cap = 0;
    const timers: number[] = [];
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
      // Once, on its own: a dip towards the pool and a bob back, so the way it moves shows.
      timers.push(
        window.setTimeout(() => {
          if (moving.current || drag.current) return;
          setEasing("transform 380ms ease-in");
          setPose({ y: 7, rx: 10, s: 0.98, o: 1 });
          setSplash((n) => n + 1);
        }, NUDGE_AFTER_MS),
        window.setTimeout(() => {
          if (moving.current || drag.current) return;
          setEasing("transform 560ms cubic-bezier(.3,1.6,.5,1)");
          setPose(REST);
        }, NUDGE_AFTER_MS + 380),
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
      timers.forEach((n) => window.clearTimeout(n));
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
   * Move to film `to`. Forward (`dir` 1): the frame tilts back, slides down the
   * chute and dives into the pool; rings spread; the next film rises out of
   * the water and settles with a bounce. Back (`dir` −1): the same, upwards.
   */
  const slideTo = (to: number, dir: 1 | -1, play = true) => {
    if (moving.current) return;
    armed.current = play;
    setIdle(!play);
    if (prefersCalm()) {
      setPose(REST);
      setProgress(0);
      setIdx(wrap(to));
      return;
    }
    moving.current = true;
    setEasing(`transform ${DIVE_MS}ms cubic-bezier(.55,0,.9,.45), opacity ${DIVE_MS}ms ease-in`);
    setPose(dir > 0 ? { y: 38, rx: 30, s: 0.86, o: 0 } : { y: -38, rx: -30, s: 0.86, o: 0 });
    if (dir > 0) window.setTimeout(() => setSplash((n) => n + 1), DIVE_MS * 0.6);
    window.setTimeout(() => {
      setEasing("none");
      setPose(dir > 0 ? { y: 22, rx: -12, s: 0.94, o: 0 } : { y: -22, rx: 12, s: 0.94, o: 0 });
      setProgress(0);
      setIdx(wrap(to));
      // Two frames so the jump to the water is painted before the rise.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setEasing(`transform ${RISE_MS}ms cubic-bezier(.25,1.45,.5,1), opacity ${RISE_MS * 0.5}ms ease-out`);
          setPose(REST);
          window.setTimeout(() => (moving.current = false), RISE_MS);
        }),
      );
    }, DIVE_MS);
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
    slideTo(i, i > idx ? 1 : -1);
  };

  // ── the finger on the frame ──
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (moving.current || (e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, h: e.currentTarget.clientHeight, on: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        drag.current = null; // sideways: not ours
        return;
      }
      d.on = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setEasing("none");
    }
    const f = Math.max(-1, Math.min(1, dy / d.h));
    setPose({ y: f * 30, rx: f * 22, s: 1 - Math.abs(f) * 0.08, o: 1 });
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > d.h * 0.18) {
      slideTo(dy > 0 ? idx + 1 : idx - 1, dy > 0 ? 1 : -1);
    } else {
      setEasing("transform 520ms cubic-bezier(.3,1.6,.5,1)");
      setPose(REST);
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
      <style>{`
        @keyframes sudagri-ring { from { transform: translate(-50%,-50%) scale(.15); opacity: .85 } to { transform: translate(-50%,-50%) scale(1.9); opacity: 0 } }
        @keyframes sudagri-water { from { background-position: 0 0, 0 0 } to { background-position: 160px 0, -120px 0 } }
        @media (prefers-reduced-motion: reduce) { .sudagri-anim { animation: none !important } }
      `}</style>

      {/* Clipped at the pool's bottom edge only, so a sinking frame never shows beneath it. */}
      <div style={{ clipPath: "inset(-60px -60px 0 -60px)" }}>
      <div style={{ perspective: "1100px", perspectiveOrigin: "50% 100%" }}>
        <figure
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative z-10 cursor-grab touch-none select-none overflow-hidden rounded-3xl bg-card shadow-float active:cursor-grabbing"
          style={{
            transform: `translateY(${pose.y}%) rotateX(${pose.rx}deg) scale(${pose.s})`,
            transformOrigin: "50% 100%",
            opacity: pose.o,
            transition: easing,
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
              // Every film ends on the logo card; hold it a moment, then slide on —
              // and after the last, back to the first, to wait for a tap.
              const last = idx === N - 1;
              window.setTimeout(() => slideTo(idx + 1, 1, !last), 1200);
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

      {/*
        The pool: the next film under moving water. Tapping it is the same dive
        as dragging the frame down; the rings spread from where the frame lands.
      */}
      <button
        type="button"
        onClick={() => slideTo(idx + 1, 1)}
        aria-label={`الفيلم التالي: ${next.label}`}
        className="relative z-20 -mt-3 block h-16 w-full overflow-hidden rounded-b-3xl rounded-t-lg border border-border shadow-card sm:h-20"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a poster frame, already sized for the web */}
        <img
          src={`/video/${next.key}-${cut}.jpg`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <span
          aria-hidden
          className="sudagri-anim absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(100deg, rgba(120,190,230,.35) 0 18px, rgba(40,110,170,.25) 18px 40px), linear-gradient(to bottom, rgba(14,90,140,.55), rgba(10,60,100,.75))",
            animation: "sudagri-water 6s linear infinite",
          }}
        />
        {[0, 1, 2].map((k) => (
          <span
            key={`${splash}-${k}`}
            aria-hidden
            className="sudagri-anim pointer-events-none absolute left-1/2 top-1 h-24 w-56 rounded-[50%] border-2 border-white/80"
            style={{
              opacity: 0,
              animation: splash ? `sudagri-ring 900ms ease-out ${k * 140}ms both` : "none",
            }}
          />
        ))}
        <span className="relative flex h-full items-center justify-center gap-2 text-sm font-bold text-white drop-shadow sm:text-base">
          <span aria-hidden className="sudagri-anim inline-block animate-bounce">⬇</span>
          التالي: {next.label}
        </span>
      </button>
      </div>

      <p className="mt-2 text-center text-xs text-muted">اسحب الإطار لأسفل لينزلق إلى الحوض ويطلع الفيلم التالي — ولأعلى للسابق</p>

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
