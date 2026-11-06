"use client";

/**
 * فيلمٌ من أفلام سوداقري بأزرار تشغيله، يُشاهَد ولا يُحمَّل.
 *
 * The owner, 3 October: the films are to be watched on the platform, not
 * saved from it. The browser's own controls are kept (they are what a reader
 * knows how to use) but without their download button, the picture-in-picture
 * pop-out and casting, and the right-click menu that offers "Save video as" is
 * turned off. Opening the file directly is handled in src/proxy.ts. None of
 * this stops a screen recorder; the films carry the Sudagri mark for that.
 *
 * `preload="none"`: only the poster is fetched until the reader presses play.
 */
export default function FilmPlayer({
  base,
  poster,
  label,
  className = "aspect-video w-full rounded-xl border border-border bg-black object-cover",
}: {
  /** The film's files without the extension: `${base}.webm` and `${base}.mp4`. */
  base: string;
  poster: string;
  label: string;
  className?: string;
}) {
  return (
    <video
      // A new film (another language's cut, on the ع / EN switch) is a new element: a <video> does not reload when only
      // its <source> children change.
      key={base}
      controls
      controlsList="nodownload noplaybackrate noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      onContextMenu={(e) => e.preventDefault()}
      playsInline
      preload="none"
      poster={poster}
      className={className}
      aria-label={label}
    >
      {/* WebM first: the open codec plays in every browser, H.264 in the rest. */}
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" />
    </video>
  );
}
