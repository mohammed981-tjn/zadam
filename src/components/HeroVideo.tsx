"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";

/**
 * واجهةُ الرئيسيّة: أفلامُ سوداغري الثلاثة، رزمةَ بطاقاتٍ متدرّجةً نحو اليمين.
 *
 * The owner, 2 October: all three films on the homepage, none removed, each
 * ending on the Sudagri logo. A sideways revolving door came first (its side
 * panels made the frame narrow), then a "pool" under the frame, then a stack
 * stepping downwards. What the owner asked for in the end: the three in a row
 * sideways, the playing film in front at its full size, the next one behind it
 * a step to the right and a step higher, and the third a step beyond that —
 * «في شكل 3D».
 *
 * So the films are a deck seen in depth. The playing film is in front; behind
 * it the next two cards stand out to the right and above, one step each,
 * smaller, darker and turned a little away, each with its name down its
 * visible edge. The deck borrows the page's right-hand margin, so the frame
 * loses almost none of its width. Drag the frame left (or down, or tap a card)
 * and it turns away and slips off to the left while the deck comes forward a
 * step, so the card that was second is now playing. Drag right (or up) for the
 * previous film, which swings in from the left. It goes round: after the third
 * comes the first. A few seconds after the first film starts the frame leans
 * aside once on its own, so a visitor sees the deck behind it.
 *
 * Only the first film plays by itself (the owner, 2 October: «الفلم الأول يعمل
 * تلقائياً والبقية عند التمرير»). A film that ends stays on its logo card and
 * leans aside again towards the deck; the next one plays when the visitor
 * moves to it. So nothing streams that nobody asked for after the first.
 *
 * The frame claims drags (`touch-action: none` on the frame only); the page
 * scrolls from everywhere else.
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
/**
 * The visitor asked to save data, or the connection is 2G: the first film does
 * not start by itself either, it waits on its poster for «▶ شاهد». A film is
 * megabytes; on a metered Sudanese connection that is a cost the visitor should
 * choose. (`navigator.connection` is Chromium-only; elsewhere this is false.)
 */
const frugal = () => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ""));
};
const prefersCalm = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where the frame is: translate in % of its size, turn about Y, scale, opacity. */
type Pose = { x: number; y: number; ry: number; s: number; o: number };
const REST: Pose = { x: 0, y: 0, ry: 0, s: 1, o: 1 };
/** Gone off to the left, turned away: where a film leaves and where the previous one comes from. */
const AWAY: Pose = { x: -55, y: 4, ry: 38, s: 0.86, o: 0 };

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
  /** The deck is coming forward a step while the front film leaves. */
  const [rising, setRising] = useState(false);
  const drag = useRef<{ x: number; y: number; w: number; h: number; on: boolean } | null>(null);
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
      if (frugal()) {
        setIdle(true);
        return;
      }
      armed.current = true;
      v.load();
      v.play().catch(() => setIdle(true));
      // Once, on its own: the frame leans aside and back, so the deck behind it shows.
      timers.push(
        window.setTimeout(() => {
          if (moving.current || drag.current) return;
          setEasing("transform 380ms ease-in");
          setPose({ x: -9, y: 0, ry: 12, s: 0.98, o: 1 });
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
   * Move to film `to`. To the next film: the front film turns away and slips
   * off to the left while the deck comes forward a step, so the second card
   * lands where the frame was, already showing the film's first picture; the
   * frame is then swapped in over it without a jump. Anywhere else (the
   * previous film, or the third): the front film leaves the same way and the
   * chosen one swings in from the left.
   */
  const slideTo = (to: number) => {
    if (moving.current) return;
    armed.current = true;
    setIdle(false);
    if (prefersCalm()) {
      setPose(REST);
      setProgress(0);
      setIdx(wrap(to));
      return;
    }
    moving.current = true;
    const fromDeck = wrap(to) === wrap(idx + 1);
    setEasing(`transform ${DROP_MS}ms cubic-bezier(.55,0,.9,.45), opacity ${DROP_MS}ms ease-in`);
    setPose(AWAY);
    if (fromDeck) setRising(true);
    window.setTimeout(() => {
      setEasing("none");
      setRising(false);
      setPose(fromDeck ? REST : AWAY);
      setProgress(0);
      setIdx(wrap(to));
      if (fromDeck) {
        window.setTimeout(() => (moving.current = false), 60);
        return;
      }
      // Two frames so the start off to the left is painted before the swing in.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setEasing(`transform ${SETTLE_MS}ms cubic-bezier(.25,1.3,.5,1), opacity ${SETTLE_MS * 0.5}ms ease-out`);
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
    slideTo(i);
  };

  // ── the finger on the frame: left or down for the next film, right or up for the previous ──
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (moving.current || (e.target as HTMLElement).closest("button")) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, on: false };
  };
  /** How far along the drag is, −1…1, positive towards the next film. */
  const along = (d: NonNullable<typeof drag.current>, e: PointerEvent<HTMLElement>) => {
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const f = Math.abs(dx) > Math.abs(dy) ? -dx / d.w : dy / d.h;
    return Math.max(-1, Math.min(1, f));
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      d.on = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setEasing("none");
    }
    const f = along(d, e);
    setPose(
      f > 0
        ? { x: -f * 40, y: f * 3, ry: f * 30, s: 1 - f * 0.1, o: 1 }
        : { x: -f * 12, y: 0, ry: f * 10, s: 1 + f * 0.03, o: 1 },
    );
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    const f = along(d, e);
    if (Math.abs(f) > 0.18) {
      slideTo(f > 0 ? idx + 1 : idx - 1);
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
        @keyframes sudagri-deal { from { opacity: 0; translate: 24px 0 } to { opacity: 1; translate: 0 0 } }
        @media (prefers-reduced-motion: reduce) { .sudagri-anim { animation: none !important; transition: none !important } }
      `}</style>

      {/*
        The deck. Each card behind is the frame's own size, moved a step right
        and a step up, scaled from its top-right corner and turned a little
        away, so a strip of it stands out beyond the card in front. The wrapper
        leaves room for two steps on the right and on top, and reaches into the
        page's right margin for them; it clips at the sides so a film leaving to
        the left never widens the page.
      */}
      <div
        className="relative -mr-4 pr-[calc(var(--sx)*2)] pt-[calc(var(--sy)*2)] [--sx:18px] [--sy:12px] sm:[--sx:40px] sm:[--sy:22px]"
        style={{ clipPath: "inset(-40px 0 -60px -16px)", perspective: "1400px", perspectiveOrigin: "30% 40%" }}
      >
        {behind.map(({ k, film: f, i }) => {
          const at = rising ? k - 1 : k;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => slideTo(i)}
              aria-label={`${k === 1 ? "الفيلم التالي" : "ثمّ"}: ${f.label}`}
              className="sudagri-anim absolute left-0 right-[calc(var(--sx)*2)] top-[calc(var(--sy)*2)] block aspect-[4/5] overflow-hidden rounded-3xl border border-white/40 bg-card shadow-float sm:aspect-video"
              style={{
                transform: `translate3d(calc(var(--sx) * ${at}), calc(var(--sy) * ${-at}), ${-at * 30}px) rotateY(${-at * 4}deg) scale(${1 - 0.03 * at})`,
                transformOrigin: "100% 0%",
                zIndex: 3 - k,
                transition: rising ? `transform ${DROP_MS}ms cubic-bezier(.3,.7,.4,1)` : "none",
                animation: "sudagri-deal 500ms ease-out both",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a poster frame, already sized for the web */}
              <img src={`/video/${f.key}-${cut}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {/* Light from the front: the edge that stands out is lit, the rest falls into shade. */}
              <span
                aria-hidden
                className="absolute inset-0 transition-opacity duration-300"
                style={{
                  background: "linear-gradient(to left, rgba(255,255,255,.18), rgba(0,0,0,.55) 22%, rgba(0,0,0,.7))",
                  opacity: at === 0 ? 0 : 0.75 + 0.15 * at,
                }}
              />
              <span
                className="absolute inset-y-0 right-0 flex w-[var(--sx)] items-center justify-center overflow-hidden text-[11px] font-bold text-white transition-opacity duration-300 [writing-mode:vertical-rl] sm:text-sm"
                style={{ opacity: at === 0 ? 0 : 1 }}
              >
                <span className="truncate drop-shadow">{f.label}</span>
              </span>
            </button>
          );
        })}

        <div className="relative z-10" style={{ perspective: "1100px", perspectiveOrigin: "100% 50%" }}>
        <figure
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative cursor-grab touch-none select-none overflow-hidden rounded-3xl bg-card shadow-float active:cursor-grabbing"
          style={{
            transform: `translate(${pose.x}%, ${pose.y}%) rotateY(${pose.ry}deg) scale(${pose.s})`,
            transformOrigin: "0% 50%",
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
              // Every film ends on the logo card and stays there; the frame
              // leans towards the deck once, to say the next film is a swipe away.
              window.setTimeout(() => {
                if (moving.current || drag.current) return;
                setEasing("transform 380ms ease-in");
                setPose({ x: -9, y: 0, ry: 12, s: 0.98, o: 1 });
                window.setTimeout(() => {
                  if (moving.current || drag.current) return;
                  setEasing("transform 560ms cubic-bezier(.3,1.6,.5,1)");
                  setPose(REST);
                }, 380);
              }, 900);
            }}
            draggable={false}
            className="pointer-events-none aspect-[4/5] w-full object-cover sm:aspect-video"
            aria-label={`فيلم سوداغري: ${film.label}`}
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
              alt="شعار سوداغري — منصّة سودانية للزراعة والتجارة"
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

      <p className="mt-2 text-center text-xs text-muted">اسحب الفيلم لليسار أو المس البطاقة التي خلفه للفيلم التالي — ولليمين للسابق</p>

      {/* One button per film, each with its own progress line. */}
      <nav aria-label="أفلام سوداغري" className="mt-2 grid grid-cols-3 gap-2">
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
