"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";

/**
 * واجهةُ الرئيسيّة: الفيديو والشعار في إطارٍ واحد.
 *
 * The owner, 26 September: «الفيديو بعد ما يخلص تظهر الصورة الشعار بعد
 * الفيديو، يعني ادمجهم». So the clip plays once, muted and inline, and when it
 * ends the Sudagri logo — golden sorghum and all — fades in over it and stays.
 * «أعد العرض» plays it again. There is no second logo elsewhere on the page:
 * the frame is the logo's place.
 *
 * On the visit where the full-screen intro (SplashOnce) has just shown the
 * same clip, playing it again here would be the repetition the owner asked to
 * avoid, so the frame opens straight on the logo. SplashOnce marks that with
 * `data-intro` on <html>; this reads it after every mount effect has run, so
 * the order the two components mount in does not matter.
 *
 * A reader who asked their device for less motion is shown the logo.
 *
 * The file is the owner's 8-second clip re-encoded to 960 px, about 0.9 MB,
 * audio dropped and the index at the front so it starts before it has
 * finished downloading.
 */
export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const v = ref.current;
      const calm =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!v || calm || document.documentElement.dataset.intro === "1") {
        setEnded(true);
        return;
      }
      v.play().catch(() => setEnded(true));
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const replay = () => {
    const v = ref.current;
    if (!v) return;
    setEnded(false);
    v.currentTime = 0;
    v.play().catch(() => setEnded(true));
  };

  return (
    <figure className="relative overflow-hidden rounded-3xl bg-card shadow-float">
      <video
        ref={ref}
        muted
        playsInline
        preload="metadata"
        poster="/video/sudan-farmer.jpg"
        onEnded={(e) => {
          e.currentTarget.currentTime = 0;
          setEnded(true);
        }}
        className="aspect-video w-full object-cover"
        aria-label="مزارعٌ سودانيّ بعمامته وجلابيته في حقل ذرةٍ ناضجة، والنيل خلفه"
      >
        {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
        <source src="/video/sudan-farmer.webm" type="video/webm" />
        <source src="/video/sudan-farmer.mp4" type="video/mp4" />
      </video>

      {/* The logo, in the same frame, once the clip has played. */}
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
