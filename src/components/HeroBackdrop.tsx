"use client";

import { useEffect, useRef, useState } from "react";
import { tr } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";

/**
 * الفيديو خلف عنوان الرئيسيّة (المالك، 6 نوفمبر 2026): خمس عشرة ثانية صامتة، تدور.
 *
 * Two cuts of one film: `hero-tall` (9:16) on a phone, `hero-wide` (16:9) from `md`. The poster under it is the
 * page's own <picture> (page.tsx), which the server sends and the browser paints first — it is the LCP — so this
 * component only ever adds the moving picture over a page that is already whole.
 *
 * What it learnt from the films before it (HeroVideo, SplashOnce):
 *
 *  - Nothing is requested until the browser has been asked: the <video> mounts with its sources only after the
 *    checks below, so a reader who is not going to see it moving never downloads a byte of it.
 *  - A reader who asked for less motion (`prefers-reduced-motion`) sees the poster alone, and so does one whose
 *    browser says data is to be saved or the connection is 2G: a film is a megabyte or two on a metered line.
 *  - Autoplay needs `muted` as a property set before playback, which React does not reliably put in the server's
 *    HTML; mounting on the client and calling `play()` from here is the path that works on phones (iOS too, with
 *    `playsInline`). If the browser refuses anyway, the poster simply stays.
 *  - The film fades in on its first `playing`, so there is never a black frame between the poster and it.
 *
 * And because it moves for longer than five seconds, there is a pause button (WCAG 2.2.2), at the corner away
 * from the text.
 */
const WIDE = "(min-width: 768px)";

const frugal = () => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ""));
};

export default function HeroBackdrop() {
  const locale = useLocale();
  const ref = useRef<HTMLVideoElement>(null);
  /** Which cut to play, once the checks pass; null: the poster alone. */
  const [cut, setCut] = useState<"wide" | "tall" | null>(null);
  const [shown, setShown] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia(WIDE);
    const decide = () => {
      if (calm.matches || frugal()) {
        setCut(null);
        setShown(false);
        return;
      }
      setCut(wide.matches ? "wide" : "tall");
    };
    decide();
    calm.addEventListener("change", decide);
    wide.addEventListener("change", decide);
    return () => {
      calm.removeEventListener("change", decide);
      wide.removeEventListener("change", decide);
    };
  }, []);

  // A new cut is a new element (the `key` below); start it, muted, as autoplay requires.
  useEffect(() => {
    const v = ref.current;
    if (!v || !cut) return;
    setShown(false);
    setPaused(false);
    v.muted = true;
    v.play().catch(() => setPaused(true));
  }, [cut]);

  if (!cut) return null;

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      v.pause();
      setPaused(true);
    }
  };

  return (
    <>
      <video
        key={cut}
        ref={ref}
        aria-hidden
        tabIndex={-1}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        disablePictureInPicture
        disableRemotePlayback
        onPlaying={() => setShown(true)}
        className={`absolute inset-0 -z-10 size-full object-cover transition-opacity duration-700 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
        <source src={`/video/hero-${cut}.webm`} type="video/webm" />
        <source src={`/video/hero-${cut}.mp4`} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          paused ? tr(locale, "شغّل الفيديو", "Play the video") : tr(locale, "أوقف الفيديو مؤقّتاً", "Pause the video")
        }
        className="absolute end-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-black/50"
      >
        {paused ? (
          <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
        )}
      </button>
    </>
  );
}
