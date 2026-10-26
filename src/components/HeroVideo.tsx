"use client";

import Image from "next/image";
import { tr } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";
import { INTRO_WAIT_MAX_MS } from "@/lib/splash";

/**
 * واجهةُ الرئيسيّة: أفلامُ سوداقري، رزمةَ بطاقاتٍ متدرّجةً نحو اليمين.
 *
 * The owner, 2 October: all three films on the homepage, none removed, each
 * ending on the Sudagri logo; then a fourth, the generated film that also
 * plays on the arc-canal page («ارفق نسخة للفيديو الجديد في الرئيسية تكمل ٤»). A sideways revolving door came first (its side
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
 * The frame claims sideways drags only (`touch-action: pan-y`): a finger moving
 * up or down over it scrolls the page, as everywhere else. Until 23 October it
 * claimed every drag, and on a phone, where the 4:5 frame is most of the
 * screen, the page could not be scrolled past it (the review of that day, UX-2).
 *
 * On a phone the first film does not start by itself either (the same review,
 * UX-1, in the fix plan the owner took on): it waits on its poster for «▶»,
 * because a film is megabytes on a metered connection. A wider screen starts
 * it as before (the owner, 2 October).
 *
 * Each film comes in two cuts, chosen by the frame's shape: 4:5 below `sm`
 * (vertical cut), 16:9 from `sm` up. Muted to start, as autoplay requires;
 * «بالصوت» turns the narration on and the choice carries across films. On the
 * visit where the full-screen intro (SplashOnce) is showing, the films wait for
 * it (`sudagri:intro-done`), with a ceiling. A reader who asked for less
 * motion is shown the logo, and films change without the motion.
 *
 * 21 October (backlog 121): the deck behind the frame is gone. The owner found
 * the films «شكلها غير جميل» and asked for them «بإبداع» on a page that reads
 * in order; the Figma design he was sent puts one large player with a pink
 * ring, and under it a reel — a card per film with its poster, its name and
 * its progress. The cards behind the frame said «there is another film»
 * without saying which; the reel says both. The swipe still works, and the
 * leaving film still turns away to the left while the chosen one swings in.
 */
const DROP_MS = 420;
const SETTLE_MS = 560;

/** `wide`: where the 16:9 cut lives when it is shared with another page rather than `/video/{key}-wide`. */
/** `enAudio`: an English-narrated copy exists at `{base}-en.mp4` (the owner chose voice 2, 11 October). */
/** `short`: the name on the film's button under the frame, where the full title was cut off with «…». */
type Film = { key: string; label: string; en: string; short: string; shortEn: string; wide?: string; enAudio?: boolean };
const FILMS: Film[] = [
  // One film on the homepage (the owner, 4 October: «اعمل فلم واحد شامل في
  // الرئيسية ووزّع باقي المقاطع كلٌّ في صفحته»): the vision from the owner's
  // film, then every clip whole and in chapters (the owner chose the whole-clip
  // cut over a two-minute one: «كل ثانية مهمة، لا تقصّه»): water and land, the
  // crops, the herds and the river, the nafir, the platform, then the market,
  // the port and the round logo once. Each clip also plays on its own page: /export, /herds,
  // /services, /tools/water, /rain, /seasons, /projects, /knowledge, /guide,
  // /lands, /arc-canal, and the nafir pages.
  { key: "sudagri", label: "سوداقري — من الماء إلى السوق", en: "Sudagri — from water to market", short: "من الماء إلى السوق", shortEn: "Water to market", enAudio: true },
  // The second film, beside the first and not instead of it (the owner, 11
  // October): the clips that came in random order, set in order — the crops,
  // then the herds, then the ideas that develop farming, and the closing.
  { key: "sudagri2", label: "ثرواتٌ وأفكار — من الحقل إلى المستقبل", en: "Wealth and ideas — from the field to the future", short: "ثرواتٌ وأفكار", shortEn: "Wealth and ideas" },
  // The investors' film, here and on /invest (backlog 140; the owner, 26 October: «ضعه في الرئيسيّة وصفحة الاستثمار»).
  { key: "investors", label: "شارِكْ في أرض السودان — للمستثمر", en: "Partner in Sudan's land — for investors", short: "للمستثمر", shortEn: "For investors" },
];
/** A film's files without the extension: `.webm`, `.mp4`, and `.jpg` for the poster. */
const filmBase = (f: Film, cut: "tall" | "wide") => (cut === "wide" && f.wide) || `/video/${f.key}-${cut}`;
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
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const ref = useRef<HTMLVideoElement>(null);
  /** Set once the programme has started; from then on a new film plays as it mounts. */
  const armed = useRef(false);
  const [idx, setIdx] = useState(0);
  /** Nothing playing: before a tap after one full round, or when playback was refused. */
  const [idle, setIdle] = useState(false);
  /** The reader asked for less motion: the logo shows until they choose a film. */
  const [calm, setCalm] = useState(false);
  const [muted, setMuted] = useState(true);
  /** The film is stopped by the reader (or has not started): the pause button reads «تشغيل». */
  const [paused, setPaused] = useState(true);
  /**
   * Arabic reads from the right, so the reel does too (backlog 122: carousels
   * and swipeable elements «flow from right to left» — Apple, «Design for
   * Arabic»; Material, «Bidirectionality»). In Arabic the next film is a drag
   * to the right and the leaving film goes off to the right; in English, the
   * other way. Every pose below is written for English and mirrored here.
   */
  const dir = locale === "ar" ? -1 : 1;
  const [progress, setProgress] = useState(0);
  const [pose, setPose] = useState<Pose>(REST);
  const [easing, setEasing] = useState("none");
  const drag = useRef<{ x: number; y: number; w: number; h: number; on: boolean } | null>(null);
  const moving = useRef(false);
  const tall = useSyncExternalStore(subscribe, isNarrow, () => false);
  const film = FILMS[idx];
  const cut = tall ? "tall" : "wide";
  const base = filmBase(film, cut);
  /** More than one film: the swipe and the reel. One film is just the frame. */
  const deck = N > 1;

  // Start the programme: now, or once the full-screen intro has finished.
  useEffect(() => {
    let cap = 0;
    const start = () => {
      window.clearTimeout(cap);
      const v = ref.current;
      if (!v) return;
      if (prefersCalm()) {
        setCalm(true);
        setIdle(true);
        return;
      }
      if (frugal() || isNarrow()) {
        setIdle(true);
        return;
      }
      armed.current = true;
      v.load();
      v.play().catch(() => setIdle(true));
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
   * Move to film `to`: the front film turns away and slips off towards the
   * end of the reading line (left in English, right in Arabic), and the chosen
   * one swings in from that side.
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
    setEasing(`transform ${DROP_MS}ms cubic-bezier(.55,0,.9,.45), opacity ${DROP_MS}ms ease-in`);
    setPose(AWAY);
    window.setTimeout(() => {
      setEasing("none");
      setPose(AWAY);
      setProgress(0);
      setIdx(wrap(to));
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
    if (!deck || moving.current || (e.target as HTMLElement).closest("button")) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, on: false };
  };
  /** How far along the drag is, −1…1, positive towards the next film. Sideways only: up and down scroll the page. */
  const along = (d: NonNullable<typeof drag.current>, e: PointerEvent<HTMLElement>) => {
    const f = (-(e.clientX - d.x) * dir) / d.w;
    return Math.max(-1, Math.min(1, f));
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      // Mostly up or down: the page is scrolling, not the films.
      if (Math.abs(e.clientY - d.y) > Math.abs(e.clientX - d.x)) {
        drag.current = null;
        return;
      }
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

  /** «فيلمان» for two, as Arabic counts them; a number with «أفلام» beyond. */
  const filmCount = N === 1 ? t("فيلم", "1 film") : N === 2 ? t("فيلمان", "2 films") : t(`${N} أفلام`, `${N} films`);

  return (
    <div>
      <style>{`
        @media (prefers-reduced-motion: reduce) { .sudagri-anim { animation: none !important; transition: none !important } }
      `}</style>

      <div className="mb-4 flex items-start gap-2">
        <h2 className="title-bar font-black" style={{ fontSize: "var(--text-section)" }}>
          {t("أفلام سوداقري", "Sudagri films")}
        </h2>
        <span className="mt-1.5 rounded-full bg-rose/10 px-2.5 py-0.5 text-xs font-bold text-rose">{filmCount}</span>
      </div>

      {/* The player: one large frame with a pink ring, clipped at the sides so
          a film leaving to the left never widens the page. */}
      <div className="relative" style={{ clipPath: "inset(-40px 0 -60px 0)", perspective: "1400px", perspectiveOrigin: "30% 40%" }}>
        <div className="relative z-10" style={{ perspective: "1100px", perspectiveOrigin: "100% 50%" }}>
        <figure
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            // The browser took the gesture (a scroll): put the frame back, change nothing.
            drag.current = null;
            setEasing("transform 520ms cubic-bezier(.3,1.6,.5,1)");
            setPose(REST);
          }}
          className={`relative select-none overflow-hidden rounded-[1.75rem] bg-card shadow-float ring-[3px] ring-primary ${deck ? "cursor-grab touch-pan-y active:cursor-grabbing" : ""}`}
          style={{
            transform: `translate(${pose.x * dir}%, ${pose.y}%) rotateY(${pose.ry * dir}deg) scale(${pose.s})`,
            transformOrigin: dir === 1 ? "0% 50%" : "100% 50%",
            opacity: pose.o,
            transition: easing,
          }}
        >
          <video
            key={`${base}-${locale}`}
            ref={ref}
            muted={muted}
            playsInline
            preload="none"
            // Watched here, not saved (src/proxy.ts has the rest): no pop-out, no casting, no "Save video as".
            disablePictureInPicture
            disableRemotePlayback
            onContextMenu={(e) => e.preventDefault()}
            poster={`${base}.jpg`}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(Math.round((v.currentTime / v.duration) * 100) / 100);
            }}
            onEnded={() => {
              setProgress(1);
              // A film ends on the logo card and stays there, with the play
              // button over it; the next film is a card in the reel below.
              setIdle(true);
            }}
            draggable={false}
            className="pointer-events-none aspect-[4/5] w-full object-cover sm:aspect-video"
            aria-label={`${t("فيلم سوداقري", "Sudagri film")}: ${t(film.label, film.en)}`}
          >
            {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
            {locale === "en" && film.enAudio ? (
              // The English narration rides on the same picture, in H.264 alone.
              <source src={`${base}-en.mp4`} type="video/mp4" />
            ) : (
              <>
                <source src={`${base}.webm`} type="video/webm" />
                <source src={`${base}.mp4`} type="video/mp4" />
              </>
            )}
          </video>

          {/* The film's name on the film, at the top where the closing logo
              card does not reach: a soft shade from the edge, white type, and
              which film of how many. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/55 via-black/20 to-transparent px-4 pb-10 pt-3 text-white"
          >
            <span className="text-sm font-bold leading-snug drop-shadow sm:text-base">{t(film.label, film.en)}</span>
            {deck && (
              <span dir="ltr" className="figure shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold backdrop-blur-sm">
                {idx + 1} / {N}
              </span>
            )}
          </div>

          {/* Sound, and a way to stop the film (backlog 122: anything that moves
              on its own for more than five seconds needs a pause — WebAIM;
              WCAG 2.2.2). Media controls are not mirrored in Arabic (IBM Carbon,
              «Right-to-left»), so the play mark points the same way in both. */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            {!idle && (
              <button
                type="button"
                onClick={() => {
                  const v = ref.current;
                  if (!v) return;
                  if (v.paused) v.play().catch(() => setIdle(true));
                  else v.pause();
                }}
                aria-label={paused ? t("تشغيل", "Play") : t("إيقاف مؤقّت", "Pause")}
                className="flex size-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-card backdrop-blur-sm transition hover:bg-black/60"
              >
                {paused ? (
                  <svg aria-hidden viewBox="0 0 12 13" className="ms-0.5 h-3.5 w-3.5 fill-current"><path d="M11 6.5 1 12V1l10 5.5Z" /></svg>
                ) : (
                  <svg aria-hidden viewBox="0 0 12 12" className="h-3.5 w-3.5 fill-current"><path d="M2 1h3v10H2zM7 1h3v10H7z" /></svg>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={!muted}
              className="rounded-full border border-white/25 bg-black/45 px-4 py-2 text-sm font-bold text-white shadow-card backdrop-blur-sm transition hover:bg-black/60"
            >
              {muted ? t("🔊 بالصوت", "🔊 Sound on") : t("🔇 بلا صوت", "🔇 Mute")}
            </button>
          </div>

          {/* Less motion asked for: the logo until a film is chosen. */}
          <div
            className={`mesh absolute inset-0 flex items-center justify-center bg-background transition-opacity duration-700 ${
              calm && idle ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <Image
              src={SUDAGRI_LOGO}
              alt={t("شعار سوداقري — منصّة سودانية للزراعة والتجارة", "Sudagri logo — a Sudanese platform for agriculture and trade")}
              placeholder="blur"
              sizes="(min-width: 768px) 420px, 70vw"
              className="h-[90%] w-auto object-contain"
            />
          </div>

          {/* Nothing playing: a white disc with the pink play mark, the one
              thing on the frame to press. */}
          {idle && (
            <button
              type="button"
              onClick={() => go(idx)}
              aria-label={t("شاهد", "Watch")}
              className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-float transition hover:scale-105 active:scale-95"
            >
              <svg aria-hidden viewBox="0 0 28 30" className="ms-1 h-8 w-7 fill-primary">
                <path d="M26 15 2 28V2l24 13Z" />
              </svg>
            </button>
          )}
        </figure>
        </div>
      </div>

      {/* The reel: a card per film with its poster, its name and how far it
          has played. In place of a line of instructions over two buttons whose
          titles were cut to «…» (backlog 121). One film has a progress line alone. */}
      {!deck ? (
        <div aria-hidden className="mt-3 h-1 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : (
        <>
          <nav
            aria-label={t("أفلام سوداقري", "Sudagri films")}
            className="mt-4 grid gap-2.5"
            style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}
          >
            {FILMS.map((f, i) => {
              const active = i === idx;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={active ? "true" : undefined}
                  aria-label={t(f.label, f.en)}
                  className={`flex flex-col gap-2 rounded-2xl bg-card p-2 pb-2.5 text-start shadow-card transition hover:-translate-y-0.5 hover:shadow-raised ${
                    active ? "ring-2 ring-primary" : "ring-1 ring-border"
                  }`}
                >
                  <span className="relative block aspect-[16/10] overflow-hidden rounded-xl bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a poster frame, already sized for the web */}
                    <img src={`${filmBase(f, "wide")}.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    <span
                      aria-hidden
                      className={`absolute bottom-2 start-2 flex size-8 items-center justify-center rounded-full shadow-card ${
                        active ? "bg-primary" : "bg-white/90"
                      }`}
                    >
                      <svg viewBox="0 0 12 13" className={`ms-0.5 h-3 w-3 ${active ? "fill-white" : "fill-primary"}`}>
                        <path d="M11 6.5 1 12V1l10 5.5Z" />
                      </svg>
                    </span>
                  </span>
                  <span className={`px-1 text-sm font-extrabold leading-snug ${active ? "text-primary" : ""}`}>{t(f.short, f.shortEn)}</span>
                  <span className="px-1 text-xs text-muted">
                    {i === 0 ? t("الفيلم الأوّل", "First film") : i === 1 ? t("الفيلم الثاني", "Second film") : t(`الفيلم ${i + 1}`, `Film ${i + 1}`)}
                  </span>
                  <span aria-hidden className="mx-1 block h-1 overflow-hidden rounded-full bg-rose/15">
                    <span
                      className="block h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${(active ? progress : 0) * 100}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </nav>
          <p className="mt-2 text-center text-xs text-muted">{t("اسحب الفيلم أو المس بطاقته", "Swipe the film, or tap its card")}</p>
        </>
      )}
    </div>
  );
}
