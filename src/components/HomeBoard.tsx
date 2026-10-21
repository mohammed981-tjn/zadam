import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import Icon, { type IconName } from "@/components/Icon";

/**
 * لوحةُ الرئيسيّة: بطاقاتٌ مصوّرة لكلّ قسم، وشريطُ تبويباتٍ سريع فوقها.
 *
 * The owner, 25 September: the homepage should be «لوحة تبويبات أو صور
 * وواجهة» — a front and a board — and the news should leave it for a page of
 * its own. The long sections that followed the hero (the farmer's chain, the
 * tools, the knowledge list, the news) each said a paragraph about a part of
 * the platform; a board shows every part at once, as a picture and a name,
 * and each opens its own page where the paragraph belongs.
 *
 * The quick tabs are for what people come back for — the news, the rain, the
 * guide — and are reached with one tap without scrolling past the pictures.
 * Every tile leads somewhere a visitor can use without an account; the land
 * and the herd, which need one, go through /signup, which says so.
 */

export interface BoardTile {
  photo: StaticImageData;
  alt: string;
  title: string;
  note: string;
  href: string;
}

export interface QuickTab {
  href: string;
  icon: IconName;
  label: string;
}

export function QuickTabs({ tabs, label = "تبويبات سريعة" }: { tabs: QuickTab[]; label?: string }) {
  return (
    <nav aria-label={label} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {tabs.map((t, i) => (
        <Link
          key={t.href}
          href={t.href}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-3 text-center text-sm font-bold shadow-card transition hover:-translate-y-0.5 hover:border-rose/60 hover:shadow-raised"
        >
          {/* Green and hibiscus in turn (backlog 121: «الأخضر والوردي الطاغي»):
              solid chips, so the six doors read as doors. Alternating rather
              than blended — green mixed into pink passes through brown. */}
          <span
            className={`flex size-11 items-center justify-center rounded-2xl text-white shadow-card ${
              i % 2 === 0 ? "bg-primary" : "bg-rose"
            }`}
          >
            <Icon name={t.icon} className="size-5" />
          </span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function PhotoBoard({
  tiles,
  enter = { label: "ادخل", arrow: "←" },
}: {
  tiles: BoardTile[];
  enter?: { label: string; arrow: string };
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((t, i) => (
        // The first tile — the water calculator, what farmers come for —
        // spans two columns so it is the largest target on the board.
        // On a wide screen it also spans two rows: 13 tiles left the last row
        // half-empty, and a 2×2 lead fills the grid to whole rows of four.
        <li key={t.href + t.title} className={i === 0 ? "col-span-2 lg:row-span-2" : undefined}>
          <Link
            href={t.href}
            className="group relative block h-full overflow-hidden rounded-2xl shadow-card transition hover:shadow-float active:scale-[0.98]"
          >
            <Image
              src={t.photo}
              alt={t.alt}
              placeholder="blur"
              sizes={i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"}
              className={`w-full object-cover transition duration-500 group-hover:scale-105 ${i === 0 ? "aspect-[2/1] lg:aspect-auto lg:h-full" : "aspect-[4/3]"}`}
              // The first row loads with the page; the rest as they scroll in.
              loading={i < 3 ? "eager" : "lazy"}
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
              <span className={`block font-black leading-tight ${i === 0 ? "text-xl sm:text-2xl" : "text-[15px] sm:text-lg"}`}>
                {t.title}
              </span>
              <span className="mt-1 line-clamp-2 block text-[11px] leading-snug opacity-90 sm:text-xs">{t.note}</span>
              {/*
                The owner, 4 October: a visitor took the tiles for pictures with
                captions and never thought to tap them. A button says it does.
              */}
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-primary shadow-card transition group-hover:bg-rose group-hover:text-white sm:text-xs">
                {enter.label} <span aria-hidden>{enter.arrow}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
