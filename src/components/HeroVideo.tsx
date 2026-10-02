"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";

/**
 * واجهةُ الرئيسيّة: الفيديو الترويجيّ والشعار في إطارٍ واحد.
 *
 * The owner, 2 October: the promo cut from his clips and stills goes here
 * («الاثنان… في الصفحة الرئيسية»). It plays once, muted and inline, with its
 * narration written on screen; «بالصوت» turns the voice on. When it ends the
 * Sudagri logo fades in over the same frame and stays, as before, and
 * «أعد العرض» plays it again.
 *
 * Two cuts of the same film, chosen by the frame's shape, not by guessing the
 * device: the frame is 4:5 below `sm` and 16:9 from `sm` up, so a phone gets
 * the vertical cut (each shot framed on its subject, the captions inside the
 * frame) and a wide screen the wide one. A 16:9 film cropped to 4:5 would cut
 * the captions in half.
 *
 * On the visit where the full-screen intro (SplashOnce) is showing, the film
 * waits for it to finish rather than playing unseen underneath. SplashOnce
 * marks the intro with `data-intro` on <html> and announces its end with the
 * `sudagri:intro-done` event; a ceiling stops a lost event from leaving the
 * frame on its poster.
 *
 * A reader who asked their device for less motion is shown the logo.
 */
const INTRO_WAIT_MAX_MS = 16000;

/** True below `sm`, where the frame is 4:5. The server renders the wide cut. */
const NARROW = "(max-width: 639.98px)";
const subscribe = (on: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const m = window.matchMedia(NARROW);
  m.addEventListener("change", on);
  return () => m.removeEventListener("change", on);
};
const isNarrow = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches;

export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(false);
  const tall = useSyncExternalStore(subscribe, isNarrow, () => false);
  const [muted, setMuted] = useState(true);

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

  const replay = () => {
    const v = ref.current;
    if (!v) return;
    setEnded(false);
    v.currentTime = 0;
    v.play().catch(() => setEnded(true));
  };

  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const cut = tall ? "tall" : "wide";

  return (
    <figure className="relative overflow-hidden rounded-3xl bg-card shadow-float">
      <video
        key={cut}
        ref={ref}
        muted={muted}
        playsInline
        preload="none"
        poster={`/video/promo-${cut}.jpg`}
        onEnded={(e) => {
          e.currentTarget.currentTime = 0;
          setEnded(true);
        }}
        className="aspect-[4/5] w-full object-cover sm:aspect-video"
        aria-label="فيلم سودجري: فجرٌ على النيل، وقنواتُ الريّ والسدود، ومزارعٌ سودانيّ في حقله، ومضخّةٌ بالطاقة الشمسية، ثمّ شعار سودجري"
      >
        {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
        <source src={`/video/promo-${cut}.webm`} type="video/webm" />
        <source src={`/video/promo-${cut}.mp4`} type="video/mp4" />
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

      {/* The logo, in the same frame, once the film has played. */}
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
          onClick={replay}
          className="absolute left-3 top-3 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-medium shadow-card transition hover:border-primary motion-reduce:hidden"
        >
          ▶ أعد العرض
        </button>
      </div>
    </figure>
  );
}
