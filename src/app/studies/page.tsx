import Image from "next/image";
import Link from "next/link";
import { PHOTOS } from "@/lib/photos";

export const metadata = {
  title: "الدراسات | سودجري",
  description:
    "دراسات سودجري: القناة القوسية، وممرّ الصادر السوداني، وأزمة سعر الصرف والتضخم وبرنامج العمل لمعالجتها.",
};

/**
 * قسم الدراسات: كلُّ دراسةٍ في المنصّة، في صفحةٍ واحدة تُفتح من القائمة.
 *
 * Each card says what kind of study it is — measured and computed on the
 * platform, or sent to it and published as written — because the two are
 * not the same claim, and a reader should know which they are reading.
 */
const STUDIES = [
  {
    href: "/studies/exchange-rate",
    title: "أزمة سعر الصرف والتضخم: دراسة وبرنامج عمل",
    note: "التشخيص، والنموذج الكمّي، والسياسة النقدية والمالية، والذهب والصادرات، والحماية الاجتماعية، وخارطة طريق من ٣٠ يوماً إلى سنة.",
    kind: "دراسة مُرسَلة — تُنشر كما كُتبت",
    photo: PHOTOS.exportStore,
    alt: "مخزن فيه جوالات سمسم وصمغ عربي وعمّال يحمّلون شاحنة",
  },
  {
    href: "/arc-canal",
    title: "القناة القوسية",
    note: "المسار والتضاريس والتربة والغطاء الأرضي، وقناةٌ محجَّمة بمعادلة مانينغ، وكلفةٌ من الكميّات.",
    kind: "قياسٌ وحساب على المنصّة",
    photo: PHOTOS.nileDam,
    alt: "سدّ خرسانيّ على نهر واسع وخزانه خلفه",
  },
  {
    href: "/export",
    title: "ممرّ الصادر السوداني",
    note: "الصمغ العربيّ والسمسم والماشية: حصصُها وأسواقُها، والبوّابات الأربع لكلّ شحنة.",
    kind: "بياناتٌ من مصادرها",
    photo: PHOTOS.dateHarvest,
    alt: "رجل على نخلة يُنزل سلّة تمر ورجال يتلقّونها والنيل خلفهم",
  },
];

export default function StudiesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-black" style={{ fontSize: "var(--text-title)" }}>
        الدراسات
      </h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        دراساتٌ في الزراعة والماء والصادر والاقتصاد السوداني — لكلٍّ منها
        صفحتها، وعلى كلٍّ منها ما هي: قياسٌ على المنصّة، أو دراسةٌ مُرسَلة
        تُنشر كما كُتبت.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {STUDIES.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-float"
            >
              <Image
                src={s.photo}
                alt={s.alt}
                placeholder="blur"
                sizes="(min-width: 640px) 50vw, 100vw"
                className="aspect-[2/1] w-full object-cover"
              />
              <span className="flex flex-1 flex-col gap-2 p-5">
                <span className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {s.kind}
                </span>
                <span className="text-lg font-black leading-snug">{s.title}</span>
                <span className="text-sm leading-7 text-muted">{s.note}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
