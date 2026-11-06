import { PHOTOS } from "@/lib/photos";

/**
 * قسم الدراسات: كلُّ دراسةٍ في المنصّة، في صفحةٍ واحدة تُفتح من القائمة.
 *
 * Each card says what kind of study it is — measured and computed on the
 * platform, or sent to it and published as written — because the two are
 * not the same claim, and a reader should know which they are reading.
 *
 * Kept here, not in the page, so the phone app's /api/app/library/studies lists the same studies with the same words
 * (item 203); /studies renders this list.
 */
export const STUDIES = [
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
