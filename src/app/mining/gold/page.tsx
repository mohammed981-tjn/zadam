import Link from "next/link";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { readFxReference } from "@/lib/fxRates";
import { GOLD_SOURCE_URL, circularUsdPerGram, fetchGoldSpot, usdPerGram } from "@/lib/goldPrice";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الذهب: أين يُباع رسمياً وبأيّ سعر | سوداقري", "Gold: where it is sold officially, and at what price | Sudagri"),
    description: tr(
      locale,
      "معلومات فقط: بنك السودان المركزي مشترياً، وقاعدة السعر اليومي في المنشور 13/2026، وحظر الاتحاد الأوروبي على الذهب السوداني، والإنتاج — كلٌّ بمصدره.",
      "Information only: the Central Bank of Sudan as buyer, the daily price rule in Circular 13/2026, the EU ban on Sudanese gold, and production — each with its source.",
    ),
  };
}

/**
 * الذهب — صفحة معلومات، لا سوق.
 *
 * The owner's approved spec, 12 October 2026: who buys gold officially, by what
 * price rule, what the EU ban means, and why the platform does not run a gold
 * market. Every statement below is the one its linked source makes, dated —
 * not more. Two things are deliberately absent:
 *
 *  - A live world gold price. The usual reference (the LBMA auction) needs a
 *    licence to republish, and an indicative "central bank price" computed
 *    from an unlicensed feed would look official without being so. The page
 *    states the rule and how to apply it to the price the seller is quoted.
 *  - A buy/sell board. See the last section; /mining's proof-of-origin
 *    registry is what the platform builds instead.
 */

const SOURCES = {
  cbosSoleBuyer: "https://sudanevents.com/index.php/2025/10/04/gold-exporters-chamber-central-bank-offers-competitive-prices-for-gold-purchases/",
  dongola: "https://see.news/central-bank-of-sudan-northern-state-branch-announces-readiness-to-purchase-gold-at-highest-market-prices",
  circular13: "https://chimpreports.com/sudan-central-bank-eases-gold-export-rules-to-boost-forex-inflows/",
  eu: "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32026R1724",
  production: "https://english.news.cn/20251229/d12f515de85847eb938374443b94959f/c.html",
};

export default async function GoldPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const src = (href: string) => (
    <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
      {t("المصدر", "Source")}
    </a>
  );
  const card = "rounded-2xl border border-border bg-card p-5";
  const spot = await fetchGoldSpot();
  const fx = readFxReference();
  const usd = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sdg = (v: number) => Math.round(v).toLocaleString("en-US");
  const when = spot
    ? new Date(spot.updatedAt).toLocaleString(locale === "en" ? "en-GB" : "ar-SD-u-nu-latn", {
        timeZone: "Africa/Khartoum",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const rows = spot
    ? [
        { label: t("السعر العالمي للأوقية (٢٤ قيراط)", "World price per troy ounce (24k)"), usd: spot.usdPerOunce },
        { label: t("للغرام عيار ٢٤، بلا خصم", "Per gram, 24k, no discount"), usd: usdPerGram(spot.usdPerOunce) },
        { label: t("للغرام عيار ٢٤ بقاعدة المنشور 13/2026", "Per gram, 24k, by Circular 13/2026"), usd: circularUsdPerGram(spot.usdPerOunce, 24), gram: true },
        { label: t("للغرام عيار ٢١: قاعدة المنشور 13/2026 × ٢١÷٢٤", "Per gram, 21k: Circular 13/2026 × 21÷24"), usd: circularUsdPerGram(spot.usdPerOunce, 21), gram: true },
      ]
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-2 text-sm">
        <Link href="/mining" className="text-primary underline">{t("→ قسم التعدين", "← Mining")}</Link>
      </p>
      <h1 className="text-2xl font-black">{t("الذهب: أين يُباع رسمياً، وبأيّ سعر", "Gold: where it is sold officially, and at what price")}</h1>
      <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
        {t(
          "صفحة معلومات فقط. المنصّة لا تشتري الذهب ولا تبيعه ولا تتوسّط فيه — والسبب في آخر الصفحة. كلّ معلومة هنا بتاريخها ومصدرها.",
          "An information page only. The platform does not buy, sell or broker gold — the reason is at the end of the page. Every statement here has its date and source.",
        )}
      </p>

      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="mb-2 text-lg font-bold">{t("سعر الذهب اليوم", "Today's gold price")}</h2>
          {spot === null ? (
            <p className="text-sm text-muted">{t("تعذّر قراءة السعر العالمي الآن. أعد فتح الصفحة بعد قليل.", "The world price could not be read just now. Reopen the page shortly.")}</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-background text-muted">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t("السعر", "Price")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("دولار", "US$")}</th>
                      {fx && <th className="px-3 py-2 text-start font-medium">{t("جنيه بسعر بنك الخرطوم", "SDG at Bank of Khartoum")}</th>}
                      {fx && <th className="px-3 py-2 text-start font-medium">{t("جنيه بالسوق الموازي", "SDG at the parallel rate")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label} className="border-t border-border">
                        <td className="px-3 py-2">{r.label}</td>
                        <td className="px-3 py-2 font-bold" dir="ltr">{usd(r.usd)}</td>
                        {fx && <td className="px-3 py-2" dir="ltr">{sdg(r.usd * fx.bank.sell)}</td>}
                        {fx && <td className="px-3 py-2" dir="ltr">{sdg(r.usd * fx.parallel.sell)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {t(
                  `السعر العالمي من gold-api.com، آخر تحديث ${when} بتوقيت الخرطوم. الجنيه بالضرب في سعر البيع: بنك الخرطوم (${fx?.bank.date ?? "—"}) والسوق الموازي (${fx?.parallel.date ?? "—"}) من صفحة الأسعار. هذا مرجعٌ تتحقّق به، والسعر الملزم هو ما يعلنه البنك المركزي عبر نظام XAR — اسأل عنه المشتري الرسمي قبل أن تبيع.`,
                  `World price from gold-api.com, last updated ${when} Khartoum time. Pounds are the dollar figure times the selling rate: Bank of Khartoum (${fx?.bank.date ?? "—"}) and the parallel market (${fx?.parallel.date ?? "—"}), from the rates page. This is a reference to check against; the binding price is the one the central bank announces through its XAR system — ask the official buyer before you sell.`,
                )}{" "}
                <a href={GOLD_SOURCE_URL} className="text-primary underline" target="_blank" rel="noopener noreferrer">gold-api.com</a>
                {" · "}
                <Link href="/rates" className="text-primary underline">{t("صفحة الأسعار", "Rates page")}</Link>
              </p>
            </>
          )}
        </section>

        <section className={card}>
          <h2 className="mb-2 text-lg font-bold">{t("مَن يشتري", "Who buys")}</h2>
          <p className="text-sm leading-relaxed">
            {t(
              "في أكتوبر ٢٠٢٥ بدأ بنك السودان المركزي شراء الذهب في بورتسودان وولاية كسلا، وقال رئيس غرفة مصدّري الذهب إنّ البنك صار المشتري الوحيد للذهب، وإنه التزم بأسعار منافسة لشركات الذهب.",
              "In October 2025 the Central Bank of Sudan began buying gold in Port Sudan and Kassala State; the chairman of the Gold Exporters' Chamber said the bank had become the sole buyer of gold and had committed to competitive prices for gold companies.",
            )}{" "}
            {src(SOURCES.cbosSoleBuyer)}
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            {t(
              "وفي مايو ٢٠٢٦ أعلن فرع البنك بالولاية الشمالية استعداده لشراء الذهب بأعلى أسعار السوق مع افتتاح مبنى سوق الذهب في دنقلا، ليكون السوق المنفذ الرئيسي لتجارة الذهب وتصديره عبر مطار دنقلا وبنك السودان المركزي.",
              "In May 2026 the bank's Northern State branch announced it was ready to buy gold at the highest market prices as the Dongola gold-market building opened, the market to be the main outlet for trading and exporting gold through Dongola airport and the Central Bank.",
            )}{" "}
            {src(SOURCES.dongola)}
          </p>
        </section>

        <section className={card}>
          <h2 className="mb-2 text-lg font-bold">{t("قاعدة السعر اليومي — المنشور 13/2026", "The daily price rule — Circular 13/2026")}</h2>
          <p className="text-sm leading-relaxed">
            {t(
              "في مايو ٢٠٢٦ أصدر البنك المركزي المنشور رقم 13/2026: يُحسب السعر اليومي من السعر العالمي لأوقية الذهب عيار ٢٤ ناقصاً ١٠ دولارات للأوقية، ثمّ يُحوَّل إلى دولار للغرام. وعلى المصارف والجهات المعنية الالتزام بالأسعار المعلنة عبر نظام XAR الإلكتروني، ولا تُخلَّص شحنة صادر تقلّ قيمتها عن هذا السعر.",
              "In May 2026 the central bank issued Circular No. 13/2026: the daily price is the world price of a 24-karat ounce minus US$10 per ounce, converted to dollars per gram. Banks and the authorities concerned must use the prices announced through the XAR electronic system, and an export shipment valued below that price is not cleared.",
            )}{" "}
            {src(SOURCES.circular13)}
          </p>
          <div className="mt-3 rounded-xl bg-background p-4 text-sm" dir="ltr">
            <p className="font-mono">USD per gram (24k) = (world price per troy ounce − 10) ÷ 31.1035</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {t(
              "لذهبٍ أقلّ من عيار ٢٤ يُضرب الناتج في نسبة النقاوة (عيار ٢١ = ٢١÷٢٤)، وهذه الخطوة حسابُنا نحن، فلم نجدها في نصّ المنشور كما نُشر. السعر العالمي في أعلى الصفحة من مصدرٍ مجّانيّ يسمح بالنشر، لا من مرجع لندن الذي يحتاج ترخيصاً؛ والسعر الرسمي اليومي هو ما يعلنه البنك عبر نظامه — فاسأل عنه المشتري الرسمي قبل أن تبيع.",
              "For gold below 24 karat, multiply by its purity (21k = 21÷24) — that step is our own arithmetic; we did not find it in the circular as published. The world price at the top of the page is from a free source that allows republishing, not the London benchmark, which needs a licence; the official daily price is the one the bank announces through its system — ask the official buyer for it before you sell.",
            )}
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            {t(
              "ومعه المنشوران 11/2026 و12/2026: يجوز للمصدّر استعمال حصيلة صادر الذهب لاستيراد ما تجيزه وزارة التجارة أو بيعها للمصارف التجارية والبنك المركزي، وأدنى عقد صادر كيلوغرام واحد.",
              "Alongside it, Circulars 11/2026 and 12/2026: an exporter may use gold export proceeds to import what the Ministry of Trade allows, or sell them to commercial banks and the central bank; the minimum export contract is one kilogram.",
            )}{" "}
            {src(SOURCES.circular13)}
          </p>
        </section>

        <section className="rounded-2xl border border-danger/40 bg-danger/5 p-5">
          <h2 className="mb-2 text-lg font-bold text-danger">{t("حظر الاتحاد الأوروبي — اللائحة 2026/1724", "The EU ban — Regulation (EU) 2026/1724")}</h2>
          <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed">
            <li>
              {t(
                "في ١٣ يوليو ٢٠٢٦ حظر مجلس الاتحاد الأوروبي شراء أو استيراد أو نقل الذهب سوداني المنشأ، مباشرةً أو بشكل غير مباشر، إذا صُدِّر من السودان إلى الاتحاد أو إلى أيّ بلدٍ ثالث بعد ١٥ يوليو ٢٠٢٦ — ومعه الوساطة والتمويل والخدمات المتصلة به.",
                "On 13 July 2026 the Council of the EU prohibited buying, importing or transferring, directly or indirectly, gold originating in Sudan if it was exported from Sudan into the Union or into any third country after 15 July 2026 — and the brokering, financing and services related to it.",
              )}
            </li>
            <li>
              {t(
                "وحظر بيع الزئبق وسيانيد الصوديوم إلى السودان أو لاستعمالها فيه، مع استثناءٍ لعقود السيانيد المبرمة قبل ١٥ يوليو ٢٠٢٦ حتى ١٦ يناير ٢٠٢٧، واستثناءات إنسانية وصحية.",
                "It also prohibited selling mercury and sodium cyanide to Sudan or for use in Sudan, with an exception for cyanide contracts concluded before 15 July 2026 until 16 January 2027, and humanitarian and health exceptions.",
              )}
            </li>
          </ul>
          <p className="mt-2 text-sm">{src(SOURCES.eu)}</p>
        </section>

        <section className={card}>
          <h2 className="mb-2 text-lg font-bold">{t("الإنتاج", "Production")}</h2>
          <p className="text-sm leading-relaxed">
            {t(
              "قالت وزارة المعادن إنّ إنتاج السودان من الذهب بلغ ٧٠ طناً في ٢٠٢٥، أعلى من المستهدف بـ١٣٪، بعد ٦٤ طناً في ٢٠٢٤ — وكان قد هبط إلى طنّين فقط بعد خمسة أشهر من الحرب في ٢٠٢٣.",
              "The Ministry of Minerals said Sudan produced 70 tonnes of gold in 2025, 13% above target, after 64 tonnes in 2024 — having fallen to only two tonnes after five months of war in 2023.",
            )}{" "}
            {src(SOURCES.production)}
          </p>
        </section>

        <section className={card}>
          <h2 className="mb-2 text-lg font-bold">{t("أين تبيع رسمياً", "Where to sell officially")}</h2>
          <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed">
            <li>{t("فروع بنك السودان المركزي التي تشتري الذهب: بورتسودان وكسلا (منذ أكتوبر ٢٠٢٥)، والولاية الشمالية عبر سوق الذهب في دنقلا (منذ مايو ٢٠٢٦).", "Central Bank of Sudan branches that buy gold: Port Sudan and Kassala (since October 2025), and the Northern State through the Dongola gold market (since May 2026).")}</li>
            <li>{t("اطلب السعر اليومي المعلن، ووزن الذهب وفحص عياره أمامك، وإيصالاً مكتوباً بالوزن والعيار والسعر.", "Ask for the announced daily price, for the gold to be weighed and assayed in front of you, and for a written receipt with the weight, purity and price.")}</li>
            <li>{t("البيع خارج القناة الرسمية يضع ذهبك في سلسلةٍ بلا أوراق، وهي أوّل ما يرفضه المشترون الملتزمون بالقانون.", "Selling outside the official channel puts your gold in a chain without papers — the first thing law-abiding buyers turn away.")}</li>
          </ul>
          <p className="mt-3 text-xs text-muted">
            {t("تأكّد من الفروع والمواعيد من البنك نفسه قبل السفر؛ قد تتغيّر بعد تاريخ هذه المصادر.", "Confirm the branches and hours with the bank itself before you travel; they may have changed since these sources were written.")}
          </p>
        </section>

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="mb-2 text-lg font-bold">{t("لماذا لا تدير المنصّة سوقاً للذهب", "Why the platform does not run a gold market")}</h2>
          <p className="text-sm leading-relaxed">
            {t(
              "لأنّ الشراء داخل السودان قناةٌ رسمية يديرها البنك المركزي، ولأنّ الذهب السوداني المصدَّر بعد ١٥ يوليو ٢٠٢٦ لا يجد مشترياً قانونياً في الاتحاد الأوروبي ولا عند من يلتزم بقانونه. منصّةٌ تجمع بائعاً بمشترٍ هنا إمّا تكرّر ما يفعله البنك، أو تفتح باباً للتهريب. ما تبنيه المنصّة بدلاً من ذلك هو إثبات المنشأ: سجلٌّ يوثّق من أين جاء الذهب وكيف استُخرج بلا زئبق — وهذا ما سيطلبه كلّ مشترٍ حين تُفتح القناة من جديد.",
              "Because buying inside Sudan is an official channel run by the central bank, and because Sudanese gold exported after 15 July 2026 finds no lawful buyer in the EU or among those who follow its law. A platform matching a seller with a buyer here would either repeat what the bank does or open a door to smuggling. What the platform builds instead is proof of origin: a registry of where the gold came from and how it was extracted without mercury — which is what every buyer will ask for when the channel reopens.",
            )}
          </p>
          <Link href="/mining/registry" className="mt-3 inline-block font-bold text-primary underline">
            {t("سجلّ إثبات المنشأ", "The proof-of-origin registry")}
          </Link>
        </section>
      </div>

      <div className="mt-6">
        <ShareWhatsApp text={t("الذهب: أين يُباع رسمياً وبأيّ سعر — سوداقري", "Gold: where it is sold officially, and at what price — Sudagri")} path="/mining/gold" locale={locale} />
      </div>
    </div>
  );
}
