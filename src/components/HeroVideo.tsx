"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";

/**
 * واجهةُ الرئيسيّة: أفلامُ سودجري كلُّها في إطارٍ واحد، ثمّ الشعار.
 *
 * The owner, 2 October: the new four-scene film goes on the homepage, «لكن
 * لا تحذف القديم إطلاقاً… أريد الفيديوهات كلها في الصفحة الرئيسية». So the
 * frame is a short programme rather than one film: the new film first, then
 * the earlier promo, then the farmer clip, each running into the next, and the
 * Sudagri logo over the frame when the last one ends. Under the frame, one
 * button per film with its own progress line — the reader sees there are three
 * and can jump to any. Nothing is removed: the promo and the farmer clip keep
 * their place, after the newest.
 *
 * Each film comes in two cuts where it has them, chosen by the frame's shape:
 * the frame is 4:5 below `sm` and 16:9 from `sm` up, so a phone gets the
 * vertical cut (shots framed on their subject, captions inside the frame). The
 * farmer clip has one cut; its farmer stands in the middle, so the 4:5 crop
 * keeps him.
 *
 * Muted to start, as autoplay requires; «بالصوت» turns the narration on and
 * the choice carries from one film to the next.
 *
 * On the visit where the full-screen intro (SplashOnce) is showing, the
 * programme waits for it to finish (`sudagri:intro-done`) rather than playing
 * unseen underneath, with a ceiling in case the event is lost.
 *
 * A reader who asked their device for less motion is shown the logo, and can
 * still start any film with its button.
 */
const INTRO_WAIT_MAX_MS = 16000;

type Film = { key: string; label: string; cuts: boolean };
const FILMS: Film[] = [
  { key: "film", label: "من السدّ إلى الحقل", cuts: true },
  { key: "promo", label: "من الماء تبدأ الحياة", cuts: true },
  { key: "sudan-farmer", label: "مزارعٌ من السودان", cuts: false },
];

/** True below `sm`, where the frame is 4:5. The server renders the wide cut. */
const NARROW = "(max-width: 639.98px)";
const subscribe = (on: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const m = window.matchMedia(NARROW);
  m.addEventListener("change", on);
  return () => m.removeEventListener("change", on);
};
const isNarrow = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches;

const src = (f: Film, tall: boolean) => (f.cuts ? `/video/${f.key}-${tall ? "tall" : "wide"}` : `/video/${f.key}`);

export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  /** Set once the programme has been started; from then on a new film plays as it mounts. */
  const armed = useRef(false);
  const [idx, setIdx] = useState(0);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const tall = useSyncExternalStore(subscribe, isNarrow, () => false);
  const film = FILMS[idx];

  // Start the programme: now, or once the full-screen intro has finished.
  useEffect(() => {
    const calm =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cap = 0;
    const start = () => {
      window.clearTimeout(cap);
      const v = ref.current;
      if (!v || calm) {
        setEnded(true);
        return;
      }
      armed.current = true;
      v.load();
      v.play().catch(() => setEnded(true));
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

  // A new film (or a new cut when the frame changes shape) plays as soon as it mounts.
  useEffect(() => {
    if (!armed.current) return;
    const v = ref.current;
    if (!v) return;
    v.load();
    v.play().catch(() => setEnded(true));
  }, [idx, tall]);

  const go = (i: number) => {
    armed.current = true;
    setEnded(false);
    setProgress(0);
    if (i === idx) {
      const v = ref.current;
      if (!v) return;
      v.currentTime = 0;
      v.play().catch(() => setEnded(true));
    } else {
      setIdx(i);
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
      <figure className="relative overflow-hidden rounded-3xl bg-card shadow-float">
        <video
          key={`${film.key}-${tall ? "tall" : "wide"}`}
          ref={ref}
          muted={muted}
          playsInline
          preload="none"
          poster={`${src(film, tall)}.jpg`}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(Math.round((v.currentTime / v.duration) * 100) / 100);
          }}
          onEnded={() => {
            setProgress(1);
            if (idx < FILMS.length - 1) {
              setProgress(0);
              setIdx(idx + 1);
            } else {
              setEnded(true);
            }
          }}
          className="aspect-[4/5] w-full object-cover sm:aspect-video"
          aria-label={`فيلم سودجري: ${film.label}`}
        >
          {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
          <source src={`${src(film, tall)}.webm`} type="video/webm" />
          <source src={`${src(film, tall)}.mp4`} type="video/mp4" />
        </video>

        {!ended && (
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={!muted}
            className="absolute bottom-3 left-3 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-medium shadow-card transition hover:border-primary"
          >
            {muted ? "🔊 بالصوت" : "🔇 بلا صوت"}
          </button>
        )}

        {/* The logo, in the same frame, once the last film has played. */}
        <div
          className={`mesh absolute inset-0 flex items-center justify-center bg-background transition-opacity duration-700 ${
            ended ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <Image
            src={SUDAGRI_LOGO}
            alt="شعار سودجري — منصّة سودانية للزراعة والتجارة"
            placeholder="blur"
            sizes="(min-width: 768px) 420px, 70vw"
            className="h-[90%] w-auto object-contain"
          />
          <button
            type="button"
            onClick={() => go(0)}
            className="absolute left-3 top-3 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-medium shadow-card transition hover:border-primary motion-reduce:hidden"
          >
            ▶ أعد العرض
          </button>
        </div>
      </figure>

      {/* One button per film, each with its own progress line. */}
      <nav aria-label="أفلام سودجري" className="mt-3 grid grid-cols-3 gap-2">
        {FILMS.map((f, i) => {
          const active = i === idx && !ended;
          const fill = ended || i < idx ? 1 : i === idx ? progress : 0;
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
