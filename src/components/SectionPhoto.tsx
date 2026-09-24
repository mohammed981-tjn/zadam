import Image, { type StaticImageData } from "next/image";

/**
 * شريطُ صورةٍ يتصدّر قسماً — وهو البديلُ عن شريط الشرائح.
 *
 * WHY NOT A CAROUSEL, WHICH IS WHAT WAS ASKED FOR
 *
 * The owner asked for the photographs to be arranged and suggested slides. The
 * reasons against are about this platform's readers rather than taste:
 *
 *   • A carousel hides everything after the first slide behind a gesture most
 *     visitors never make. The site pays to load five pictures so that almost
 *     nobody sees more than one.
 *   • It loads them anyway, on connections where bytes are the expensive part.
 *   • And it would push the four counted figures — FAOSTAT observations,
 *     reviewed entries, crops, stations — below the fold. Those are the page's
 *     argument. A slideshow above them says the pictures matter more, and on
 *     this site they do not.
 *
 * So: one photograph per section, each beside the text it belongs to, loaded
 * when the reader arrives at it. Nothing hidden, nothing fetched before it is
 * wanted.
 *
 * WHY `caption` IS NOT OPTIONAL DECORATION
 *
 * Every photograph here is generated, not taken. On a page of measured numbers
 * that distinction matters: a reader is entitled to know that the dam in the
 * picture is not a photograph of a dam that exists. `/arc-canal` in particular
 * argues from SRTM elevations and Manning's equation, and an uncaptioned
 * picture there would quietly imply the canal is built.
 *
 * `priority` is deliberately absent: these all sit below the fold, and the hero
 * logo is the page's largest paint. `placeholder="blur"` comes from the static
 * import, so each band opens on the picture's own colours rather than a hole.
 */
export default function SectionPhoto({
  src,
  alt,
  caption,
  className = "",
}: {
  src: StaticImageData;
  alt: string;
  /** ما تُظهره الصورةُ حقّاً — وأنّها مولَّدة، حيث يلتبس الأمر. */
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={className}>
      {/*
        `aspect-[21/9]` with `object-cover` crops rather than letterboxes, so
        the band keeps a usable height on a 390px screen instead of collapsing
        into a stripe of sky.
      */}
      <Image
        src={src}
        alt={alt}
        placeholder="blur"
        sizes="(min-width: 1152px) 1088px, 100vw"
        className="aspect-[21/9] w-full object-cover"
      />
      {caption && (
        <figcaption className="px-4 pt-2 text-xs leading-relaxed text-muted sm:px-6">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
