import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

export interface StripItem {
  photo: StaticImageData;
  alt: string;
  title: string;
  note: string;
  href: string;
}

/**
 * شريطُ الصور الأفقيّ في مقدّمة الرئيسيّة — وكلُّ صورةٍ فيه بابٌ لا زينة.
 *
 * WHAT THE OWNER ASKED FOR, TWICE
 *
 * First a carousel; I argued for one photograph per section instead and built
 * that. He asked again, precisely: the pictures at the front, not further down,
 * arranged horizontally. That is his call on his own homepage, and it is made
 * here — the reasons I gave against a carousel are answered rather than
 * overruled:
 *
 *   • «It hides everything after the first slide.» — This is not a slideshow.
 *     It is a scrolling row with the next card deliberately cut off at the
 *     edge, so a reader sees at a glance that there is more, and swipes with
 *     the same gesture as any list on their phone. Nothing auto-advances.
 *   • «It downloads them all anyway.» — Only the first two load eagerly; the
 *     rest are lazy and are fetched as they scroll into view.
 *   • «It buries the numbers.» — It sits directly *under* the hero, so the
 *     headline and the four counted figures remain the first thing on the page.
 *
 * WHY EVERY CARD IS A LINK
 *
 * A row of pictures that goes nowhere is decoration, and decoration above the
 * fold is what pushes the argument down. Each card here opens a part of the
 * platform that a visitor can use **without an account** — so the strip
 * doubles as a visual map of what exists. Pages that need a login (land,
 * seasons, herds) are reached through `/signup`, which says so, rather than
 * through a link that silently bounces to the login screen.
 *
 * WHY THE DISCLOSURE LINE
 *
 * Every photograph is generated. On a platform whose whole claim is that its
 * numbers can be checked, a reader is owed that sentence — once, plainly, under
 * the row.
 */
export default function PhotoStrip({ items }: { items: StripItem[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-label="أقسام المنصّة" className="border-b border-border">
      <div className="mx-auto max-w-6xl py-8">
        {/*
          `-mx` is unnecessary here: the container carries no side padding, and
          the list supplies its own `px-4`, so on a phone the row scrolls edge to
          edge while the first card still starts inside the page gutter.
          `scroll-px-4` makes snapping respect that same gutter.
        */}
        <ul className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3">
          {items.map((it, i) => (
            <li
              key={it.href + i}
              className="w-[78vw] max-w-[300px] shrink-0 snap-start"
            >
              <Link
                href={it.href}
                className="group block h-full overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:shadow-raised"
              >
                <div className="overflow-hidden">
                  <Image
                    src={it.photo}
                    alt={it.alt}
                    placeholder="blur"
                    loading={i < 2 ? "eager" : "lazy"}
                    sizes="(min-width: 640px) 300px, 78vw"
                    className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-bold">{it.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {it.note}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-4 text-xs text-muted">
          الصورُ مولَّدةٌ لأغراض العرض، ولا تمثّل أشخاصاً أو مواقعَ بعينها.
        </p>
      </div>
    </section>
  );
}
