"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { SUDAGRI_LOGO } from "@/lib/brand";

/**
 * واجهةُ الرئيسيّة: شعارُ سودجري، وفيديو المزارع عند الطلب.
 *
 * Since the intro became the clip followed by the logo screen (the owner, 25
 * September: «يندمج شاشة البداية مع الفيديو»), the visitor has just watched
 * the clip full-screen; playing it again here would be the repetition the
 * owner asked to avoid. So this starts on the logo, fetches nothing until asked
 * (`preload="none"`), and «شاهد الفيديو» plays it once and returns to the logo.
 *
 * The file is the owner's 8-second clip re-encoded to 960 px, about 0.9 MB,
 * audio dropped and the index at the front so it starts before it has
 * finished downloading. A reader who has asked their device for less motion
 * is shown the logo from the start.
 */
export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(true);

  const replay = () => {
    const v = ref.current;
    if (!v) return;
    setEnded(false);
    v.currentTime = 0;
    void v.play();
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
          e.currentTarget.currentTime = 0;
          setEnded(true);
        }}
        className="aspect-video w-full object-cover motion-reduce:invisible"
        aria-label="مزارعٌ سودانيّ بعمامته وجلابيته في حقل ذرةٍ ناضجة، والنيل خلفه"
      >
        {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
        <source src="/video/sudan-farmer.webm" type="video/webm" />
        <source src="/video/sudan-farmer.mp4" type="video/mp4" />
      </video>

      {/* The logo, over the rewound video once it has played. */}
      <div
        className={`mesh absolute inset-0 flex items-center justify-center bg-background transition-opacity duration-700 ${
          ended ? "opacity-100" : "pointer-events-none opacity-0 motion-reduce:pointer-events-auto motion-reduce:opacity-100"
        }`}
      >
        <Image
          src={SUDAGRI_LOGO}
          alt="شعار سودجري — منصّة سودانية للزراعة والتجارة"
          placeholder="blur"
          sizes="(min-width: 768px) 360px, 60vw"
          className="h-[88%] w-auto object-contain"
        />
        <button
          type="button"
          onClick={replay}
          className="absolute bottom-3 left-3 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium shadow-card transition hover:border-primary motion-reduce:hidden"
        >
          ▶ شاهد الفيديو
        </button>
      </div>
    </figure>
  );
}
