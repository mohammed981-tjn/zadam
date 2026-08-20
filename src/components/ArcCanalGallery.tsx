import { createClient } from "@/lib/supabase/server";
import { publicMediaUrl } from "@/lib/media";
import type { ArcCanalImage } from "@/types/database";

/**
 * صور الأرض — كلٌّ منها بمصدرها.
 *
 * Renders nothing at all when there are no published images, rather than an
 * empty frame or a placeholder. A study page with a "no images yet" panel on it
 * reads as unfinished; a study page with no image section reads as a study page
 * with no images, which is what it is.
 *
 * Every caption carries its credit, in the same line, at the same weight as the
 * caption itself. Putting the source in a hover title or a footnote would make
 * it a formality — and on a page whose whole argument is that claims travel
 * with their basis, an uncredited photograph would be the one exception.
 */
export default async function ArcCanalGallery() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("arc_canal_images")
    .select(
      "id, storage_path, caption, credit, source_url, taken_on, sort_order, published, created_at, created_by",
    )
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const images = (data ?? []) as ArcCanalImage[];
  if (images.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">صور من الأرض</h2>

      <ul className="grid gap-4 sm:grid-cols-2">
        {images.map((img) => (
          <li
            key={img.id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
          >
            {/*
              A plain img rather than next/image: the bucket is an external
              origin, so the optimiser would need a remotePatterns entry, and
              these are a few already-compressed pictures on one page. Explicit
              lazy loading because they sit well below the fold.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicMediaUrl(img.storage_path)}
              alt={img.caption}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
            <figcaption className="flex flex-col gap-1 p-3">
              <p className="text-sm leading-relaxed">{img.caption}</p>
              <p className="text-xs text-muted">
                {img.source_url ? (
                  <a
                    href={img.source_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary underline"
                  >
                    {img.credit}
                  </a>
                ) : (
                  img.credit
                )}
                {img.taken_on && ` · ${img.taken_on}`}
              </p>
            </figcaption>
          </li>
        ))}
      </ul>
    </section>
  );
}
