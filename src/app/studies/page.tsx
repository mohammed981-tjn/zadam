import Image from "next/image";
import Link from "next/link";
import { PHOTOS } from "@/lib/photos";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الدراسات | سوداقري", "Studies | Sudagri"),
    description: tr(
      locale,
      "دراسات سوداقري: القناة القوسية، وممرّ الصادر السوداني، وأزمة سعر الصرف والتضخم وبرنامج العمل لمعالجتها.",
      "Sudagri's studies: the Arc Canal, the Sudanese export corridor, and the exchange-rate and inflation crisis with a programme of action to address it.",
    ),
  };
}

/**
 * قسم الدراسات: كلُّ دراسةٍ في المنصّة، في صفحةٍ واحدة تُفتح من القائمة.
 *
 * Each card says what kind of study it is — measured and computed on the
 * platform, or sent to it and published as written — because the two are
 * not the same claim, and a reader should know which they are reading.
 */
const STUDIES = [
  {
    href: "/library",
    title: "مكتبة الدراسات والبحوث",
    titleEn: "The studies and research library",
    note: "دراسات جدوى وبحوثٌ ورسائل جامعيّة وتقارير يرسلها الباحثون والمزارعون والزوّار، وتُنشر بعد المراجعة. شارك دراستك.",
    noteEn: "Feasibility studies, research, theses and reports sent by researchers, farmers and visitors, published after review. Share yours.",
    kind: "يرسلها الناس — تُراجَع ثمّ تُنشر",
    kindEn: "Sent by people — reviewed, then published",
    photo: PHOTOS.grainSoil,
    alt: "كفّان تغرفان حبّاً من جوال، وعيّنة تربة ودفتر على الطاولة",
    altEn: "Two hands scooping grain from a sack, with a soil sample and a notebook on the table",
  },
  {
    href: "/studies/exchange-rate",
    title: "أزمة سعر الصرف والتضخم: دراسة وبرنامج عمل",
    titleEn: "The exchange-rate and inflation crisis: a study and a programme of action",
    note: "التشخيص، والنموذج الكمّي، والسياسة النقدية والمالية، والذهب والصادرات، والحماية الاجتماعية، وخارطة طريق من ٣٠ يوماً إلى سنة.",
    noteEn:
      "The diagnosis, the quantitative model, monetary and fiscal policy, gold and exports, social protection, and a roadmap from 30 days to one year. In Arabic.",
    kind: "دراسة مُرسَلة — تُنشر كما كُتبت",
    kindEn: "Submitted study — published as written",
    photo: PHOTOS.exportStore,
    alt: "مخزن فيه جوالات سمسم وصمغ عربي وعمّال يحمّلون شاحنة",
    altEn: "A warehouse with sacks of sesame and gum arabic, and workers loading a lorry",
  },
  {
    href: "/arc-canal",
    title: "القناة القوسية",
    titleEn: "The Arc Canal",
    note: "المسار والتضاريس والتربة والغطاء الأرضي، وقناةٌ محجَّمة بمعادلة مانينغ، وكلفةٌ من الكميّات.",
    noteEn: "The route, terrain, soil and land cover, a canal sized with Manning's equation, and a cost built from quantities.",
    kind: "قياسٌ وحساب على المنصّة",
    kindEn: "Measured and computed on the platform",
    photo: PHOTOS.nileDam,
    alt: "سدّ خرسانيّ على نهر واسع وخزانه خلفه",
    altEn: "A concrete dam on a wide river with its reservoir behind it",
  },
  {
    href: "/export",
    title: "ممرّ الصادر السوداني",
    titleEn: "The Sudanese export corridor",
    note: "الصمغ العربيّ والسمسم والماشية: حصصُها وأسواقُها، والبوّابات الأربع لكلّ شحنة.",
    noteEn: "Gum arabic, sesame and livestock: their shares and markets, and the four gates every shipment passes.",
    kind: "بياناتٌ من مصادرها",
    kindEn: "Data from its sources",
    photo: PHOTOS.dateHarvest,
    alt: "رجل على نخلة يُنزل سلّة تمر ورجال يتلقّونها والنيل خلفهم",
    altEn: "A man up a palm lowering a basket of dates to men below, with the Nile behind them",
  },
];

export default async function StudiesPage() {
  const locale = await getLocale();
  const en = locale === "en";
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 lg:max-w-6xl xl:max-w-7xl">
      <h1 className="font-black" style={{ fontSize: "var(--text-title)" }}>
        {tr(locale, "الدراسات", "Studies")}
      </h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {tr(
          locale,
          "دراساتٌ في الزراعة والماء والصادر والاقتصاد السوداني — لكلٍّ منها صفحتها، وعلى كلٍّ منها ما هي: قياسٌ على المنصّة، أو دراسةٌ مُرسَلة تُنشر كما كُتبت.",
          "Studies of Sudan's farming, water, exports and economy — each on its own page, and each marked for what it is: measured on the platform, or a submitted study published as written.",
        )}
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STUDIES.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-float"
            >
              <Image
                src={s.photo}
                alt={en ? s.altEn : s.alt}
                placeholder="blur"
                sizes="(min-width: 640px) 50vw, 100vw"
                className="aspect-[2/1] w-full object-cover"
              />
              <span className="flex flex-1 flex-col gap-2 p-5">
                <span className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {en ? s.kindEn : s.kind}
                </span>
                <span className="text-lg font-black leading-snug">{en ? s.titleEn : s.title}</span>
                <span className="text-sm leading-7 text-muted">{en ? s.noteEn : s.note}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
