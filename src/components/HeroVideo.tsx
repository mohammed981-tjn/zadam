"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";

/**
 * واجهةُ الرئيسيّة: أفلامُ سودجري الثلاثة، رزمةَ بطاقاتٍ رأسيّة.
 *
 * The owner, 2 October: all three films on the homepage, none removed, each
 * ending on the Sudagri logo. A sideways revolving door came first; its side
 * panels made the frame narrow. Then a "pool" under the frame. Then the owner
 * asked for the three to show vertically, «الشريحة الأولى إلى بعدها تنزل عنها
 * ٢ سم وكذا» — each card a step below the one before.
 *
 * So the films are a stack. The playing film is on top at full width; behind
 * it, the next two films' cards stand out below it one step each, a little
 * narrower and darker, each with its name on the strip that shows. Drag the
 * frame down (or tap a card) and the top film drops away while the stack rises
 * a step, so the card that was second is now playing. Drag up for the previous
 * film, which comes down onto the stack. It goes round: after the third comes
 * the first. A few seconds after the first film starts the frame dips once on
 * its own, so a visitor sees that it moves. When a film ends (each on the logo
 * card) the stack moves on by itself; after one full round it returns to the
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
 * motion is shown the logo, and films change without the motion.
 */
const INTRO_WAIT_MAX_MS = 16000;
const DROP_MS = 420;
const SETTLE_MS = 560;
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
  /** The stack is rising a step while the top film drops away. */
  const [rising, setRising] = useState(false);
  const drag = useRef<{ x: number; y: number; h: number; on: boolean } | null>(null);
  const moving = useRef(false);
  const tall = useSyncExternalStore(subscribe, isNarrow, () => false);
  const film = FILMS[idx];
  const cut = tall ? "tall" : "wide";
  const base = `/video/${film.key}-${cut}`;
  /** The cards behind the frame: the next film, then the one after. */
  const behind = [1, 2].map((k) => ({ k, film: FILMS[wrap(idx + k)], i: wrap(idx + k) }));

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
      // Once, on its own: a dip towards the cards below and a bob back, so the way it moves shows.
      timers.push(
        window.setTimeout(() => {
          if (moving.current || drag.current) return;
          setEasing("transform 380ms ease-in");
          setPose({ y: 7, rx: 10, s: 0.98, o: 1 });
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
   * Move to film `to`. Forward (`dir` 1): the top film tilts and drops away
   * while the stack rises a step, so the second card lands where the frame
   * was, already showing the film's first picture; the frame is then swapped
   * in under it without a jump. Back (`dir` −1): the top film lifts away and
   * the previous film comes down onto the stack.
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
    setEasing(`transform ${DROP_MS}ms cubic-bezier(.55,0,.9,.45), opacity ${DROP_MS}ms ease-in`);
    setPose(dir > 0 ? { y: 30, rx: 24, s: 0.9, o: 0 } : { y: -30, rx: -24, s: 0.9, o: 0 });
    // Forward to the next film only: the stack rises a step under the falling frame.
    if (dir > 0 && wrap(to) === wrap(idx + 1)) setRising(true);
    window.setTimeout(() => {
      const fromStack = dir > 0 && wrap(to) === wrap(idx + 1);
      setEasing("none");
      setRising(false);
      setPose(fromStack ? REST : { y: -14, rx: 0, s: 1.02, o: 0 });
      setProgress(0);
      setIdx(wrap(to));
      if (fromStack) {
        window.setTimeout(() => (moving.current = false), 60);
        return;
      }
      // Two frames so the start above the stack is painted before the descent.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setEasing(`transform ${SETTLE_MS}ms cubic-bezier(.25,1.35,.5,1), opacity ${SETTLE_MS * 0.5}ms ease-out`);
          setPose(REST);
          window.setTimeout(() => (moving.current = false), SETTLE_MS);
        }),
      );
    }, DROP_MS);
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
        @keyframes sudagri-deal { from { opacity: 0; translate: 0 18px } to { opacity: 1; translate: 0 0 } }
        @media (prefers-reduced-motion: reduce) { .sudagri-anim { animation: none !important; transition: none !important } }
      `}</style>

      {/*
        The stack. Each card behind is the frame's own size, scaled from its
        bottom edge and moved down one step, so a strip of it — one step tall —
        stands out below the card in front. The wrapper leaves room for two
        steps and clips there, so a dropping frame never shows beneath it.
      */}
      <div
        className="relative pb-[calc(var(--step)*2)] [--step:44px] sm:[--step:56px]"
        style={{ clipPath: "inset(-60px -60px 0 -60px)" }}
      >
        {behind.map(({ k, film: f, i }) => {
            const at = rising ? k - 1 : k;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => slideTo(i, 1)}
                aria-label={`${k === 1 ? "الفيلم التالي" : "ثمّ"}: ${f.label}`}
                className="sudagri-anim absolute inset-x-0 top-0 block aspect-[4/5] overflow-hidden rounded-3xl border border-border bg-card shadow-card sm:aspect-video"
                style={{
                  transform: `translateY(calc(var(--step) * ${at})) scale(${1 - 0.05 * at})`,
                  transformOrigin: "50% 100%",
                  zIndex: 3 - k,
                  transition: rising ? `transform ${DROP_MS}ms cubic-bezier(.3,.7,.4,1)` : "none",
                  animation: "sudagri-deal 500ms ease-out both",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a poster frame, already sized for the web */}
                <img src={`/video/${f.key}-${cut}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-black transition-opacity duration-300"
                  style={{ opacity: 0.1 + 0.12 * at }}
                />
                <span
                  className="absolute inset-x-0 bottom-0 flex h-[var(--step)] items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-black/20 text-sm font-bold text-white transition-opacity duration-300 sm:text-base"
                  style={{ opacity: at === 0 ? 0 : 1 }}
                >
                  <span aria-hidden className="sudagri-anim inline-block animate-bounce">
                    ⬆
                  </span>
                  {k === 1 ? "التالي" : "ثمّ"}: {f.label}
                </span>
              </button>
            );
          })}

        <div className="relative z-10" style={{ perspective: "1100px", perspectiveOrigin: "50% 100%" }}>
        <figure
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative cursor-grab touch-none select-none overflow-hidden rounded-3xl bg-card shadow-float active:cursor-grabbing"
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
      </div>

      <p className="mt-2 text-center text-xs text-muted">اسحب الإطار لأسفل أو المس البطاقة التي تحته للفيلم التالي — ولأعلى للسابق</p>

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
