"use client";

import { useRef, useState } from "react";

/**
 * واجهةُ الرئيسيّة: فيديو المزارع في إطاره، يعمل حين يُطلب.
 *
 * The intro already plays the clip full-screen and then the logo screen (the
 * owner, 25 September: «يندمج شاشة البداية مع الفيديو»), and the logo with its
 * golden sorghum stands beside the headline (the owner again: keep it, it is
 * the best thing on the screen). So this frame neither repeats the logo nor
 * plays by itself: it shows the clip's first frame, fetches nothing until
 * asked (`preload="none"`), and «شاهد الفيديو» plays it once and rewinds.
 *
 * The file is the owner's 8-second clip re-encoded to 960 px, about 0.9 MB,
 * audio dropped and the index at the front so it starts before it has
 * finished downloading.
 */
export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0;
    setPlaying(true);
    v.play().catch(() => setPlaying(false));
  };

  return (
    <figure className="relative overflow-hidden rounded-3xl bg-card shadow-float">
      <video
        ref={ref}
        muted
        playsInline
        preload="none"
        poster="/video/sudan-farmer.jpg"
        onEnded={(e) => {
          e.currentTarget.load(); // back to the poster, the clip's first frame
          setPlaying(false);
        }}
        className="aspect-video w-full object-cover"
        aria-label="مزارعٌ سودانيّ بعمامته وجلابيته في حقل ذرةٍ ناضجة، والنيل خلفه"
      >
        {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
        <source src="/video/sudan-farmer.webm" type="video/webm" />
        <source src="/video/sudan-farmer.mp4" type="video/mp4" />
      </video>

      {!playing && (
        <button
          type="button"
          onClick={play}
          className="absolute bottom-3 left-3 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-medium shadow-card transition hover:border-primary"
        >
          ▶ شاهد الفيديو
        </button>
      )}
    </figure>
  );
}
