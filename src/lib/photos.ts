import geziraFarmer from "../../public/photos/gezira-farmer.webp";
import herdCanal from "../../public/photos/herd-canal.webp";
import canalRegulator from "../../public/photos/canal-regulator.webp";
import nileDam from "../../public/photos/nile-dam.webp";
import irrigatedPlain from "../../public/photos/irrigated-plain.webp";
import solarPump from "../../public/photos/solar-pump.webp";
import dateHarvest from "../../public/photos/date-harvest.webp";
import vetHerd from "../../public/photos/vet-herd.webp";
import exportStore from "../../public/photos/export-store.webp";
import landSurvey from "../../public/photos/land-survey.webp";
import womenHarvest from "../../public/photos/women-harvest.webp";
import grainSoil from "../../public/photos/grain-soil.webp";
import miningSieve from "../../public/photos/mining-sieve.webp";

/**
 * صورُ الصفحات — مستورَدةً لا مساراتٍ، ولكلٍّ منها مصدرٌ معروف.
 *
 * WHY IMPORTS AND NOT PATHS — the same reason as `brand.ts`: a static import is
 * read at build time, so Next.js derives the dimensions (no layout jump) and a
 * `blurDataURL` inlined in the markup, which paints before any request. On the
 * connections this platform is read on, that is the difference between a
 * section that opens on colour and one that opens on a hole.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHAT IT REFUSES
 *
 * The owner sent ten images to put on the site. Most were stock-library
 * **previews**, not licensed files — three at 612px and 800px, which are the
 * sizes those libraries hand out before purchase, and one carrying a visible
 * `alamy` watermark and its catalogue number. Publishing them on a commercial
 * site is infringement, and on a platform whose entire argument is «كل رقمٍ
 * هنا يمكنك أن تعيد حسابه بنفسك» it is also self-defeating: a borrowed picture
 * under a promise of verifiability.
 *
 * Several others were of the wrong place entirely — Holstein dairy cattle, a
 * Dutch windmill, offshore wind farms, temperate green pasture. Sudan is
 * sorghum, humped zebu, silt-brown canals and a horizon that dissolves in dust.
 * A visitor who knows the country sees the difference in the first second.
 *
 * So every photo here is generated in the owner's own Canva workspace from a
 * prompt written for Sudan specifically — his to use, and of the right country.
 * **Nothing enters this file without both.** If a picture cannot be shown to be
 * owned and to be of the place it claims, it does not go on the site.
 */

/**
 * كلُّها ١٦٨٠×٩٤٤، WebP بجودة ٨٢ — بين ١٠٠ و٢٨٠ ك.ب للواحدة. ولأنّ كلَّ واحدةٍ
 * تُحمَّل كسولاً عند الوصول إلى قسمها، لا يدفع الزائرُ ثمنَ صورةٍ لم يصل إليها.
 */
export const PHOTOS = {
  /** مزارعٌ عند حقل ذرةٍ وترعةٍ ترابيّة، ونخيلٌ في الأفق. */
  geziraFarmer,
  /** قطيعُ بقرٍ ذي سنامٍ وقرونٍ طويلة يسير بمحاذاة ترعةٍ في الغبار. */
  herdCanal,
  /** قنطرةٌ خرسانيّةٌ ببوّاباتٍ فولاذيّة، والماءُ الطينيُّ يمرّ تحتها. */
  canalRegulator,
  /** سدٌّ خرسانيٌّ على نهرٍ واسع، وخزّانُه خلفه، وأرضٌ قاحلةٌ حوله. */
  nileDam,
  /** السهلُ المرويُّ من الجوّ: شبكةُ حقولٍ هندسيّة، ونخيلٌ على الترع، والنهرُ في الأفق. */
  irrigatedPlain,
  /** مضخّةٌ بالطاقة الشمسيّة تصبّ في ترعةٍ ترابيّة، وحقلُ بصلٍ أخضر إلى جوارها. */
  solarPump,
  /** قطعُ التمر: رجلٌ على النخلة يُنزل سَبَتاً، وآخرون يتلقّونه، والنيلُ خلفهم. */
  dateHarvest,
  /** طبيبٌ بيطريٌّ يحقن بقرةً ذات سنامٍ في زريبة، وراعيها يمسك قرنها. */
  vetHerd,
  /** مخزنُ صادر: جوالاتُ سمسمٍ وصمغٍ عربيٍّ وميزانٌ وشاحنةٌ تُحمَّل. */
  exportStore,
  /** مسّاحٌ بجهاز GNSS على أرضٍ متشقّقة، وجرّارٌ يحرث خلفه قرب ترعة. */
  landSurvey,
  /** نساءٌ يحصدن الفول السودانيّ ويغربلنه في سلّةٍ من السعف، والطلحُ في الأفق. */
  womenHarvest,
  /** كفّان تغرفان حبّاً من جوال، وعيّنةُ تربةٍ ودفترٌ على الطاولة، والذرةُ خلفها. */
  grainSoil,
  /** معدّنون أهليّون بخوذاتٍ وكمّامات يغربلون الترابَ عند بئرٍ خشبيّة. */
  miningSieve,
} as const;
