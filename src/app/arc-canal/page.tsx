import Link from "next/link";
import SectionPhoto from "@/components/SectionPhoto";
import { PHOTOS } from "@/lib/photos";
import NotifyMeForm from "@/components/NotifyMeForm";
import ArcCanalProfile from "@/components/ArcCanalProfile";
import ArcCanalMap from "@/components/ArcCanalMap";
import MapScreen from "@/components/map/MapScreen";
import { mapThemes } from "@/lib/mapLayers";
import ArcCanalCorridor from "@/components/ArcCanalCorridor";
import ArcCanalWater from "@/components/ArcCanalWater";
import ArcCanalDesign from "@/components/ArcCanalDesign";
import ArcCanalDossier from "@/components/ArcCanalDossier";
import ArcCanalGallery from "@/components/ArcCanalGallery";
import { summarise, ROUTE_LENGTH_KM, ROUTE } from "@/lib/arcCanal";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import FilmPlayer from "@/components/FilmPlayer";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "القناة القوسية — دراسة سوداقري | سوداقري", "The Arc Canal — a Sudagri study | Sudagri"),
  };
}

/**
 * The Arc Canal, as this platform's own study.
 *
 * WHAT CHANGED, AND WHY
 *
 * This page used to be a review. It scored eleven documents that arrived with
 * the project, gave each claim a verdict — holds, overstated, unsupported — and
 * printed the tally at the top. That was the wrong deliverable twice over.
 *
 * It repeated numbers in order to knock them down, and a reader remembers
 * "236 km" and "150,000 jobs" long after the sentence saying nothing supports
 * them. And it made this platform's contribution look like commentary on
 * somebody else's work, when the contribution is the measurement and the
 * arithmetic: forty-one elevations off SRTM, a climate off MERRA-2, a water
 * requirement out of FAO-56, a canal sized by Manning's equation, and a capital
 * cost built from quantities times named unit rates.
 *
 * So the review is gone and the study stands on its own. Nothing here needs
 * another document to be true. Where a figure of ours happens to differ from
 * what circulates about this project, it is stated once, as our figure, without
 * an argument attached.
 *
 * The findings table is still in the database. It is a record of work done and
 * it may matter later; it is simply not what this page is for.
 */

export default async function ArcCanalPage() {
  const summary = summarise();
  const west = ROUTE.reduce((a, b) => (b.lon < a.lon ? b : a));
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t("دراسة سوداقري · قياس وحساب", "A Sudagri study · measurement and calculation")}</p>
        <h1 className="text-3xl font-bold leading-tight">
          {t("القناة القوسية — دراسة الأرض والتصميم", "The Arc Canal — a study of the ground and the design")}
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          {t(
            "قناة تدور غرب أم درمان من خزان جبل أولياء جنوباً إلى السروراب شمالاً، لريّ أرضٍ غرب المدينة. نزلنا على المسار وقِسناه، وحسبنا احتياجه المائي وتصميمه الهندسي وكلفته من الكميّات. كل رقم هنا مقيسٌ أو محسوب، ومصدره ومنهجه مذكوران معه.",
            "A canal curving west of Omdurman from the Jebel Aulia reservoir in the south to Sarurab in the north, to irrigate land west of the city. We went over the route and measured it, and computed its water need, its engineering design and its cost from quantities. Every number here is measured or computed, with its source and method stated beside it.",
          )}
        </p>
        <ShareWhatsApp
          path="/arc-canal"
          text={t(
            "القناة القوسية — دراسة الأرض والتصميم بالقياسات:",
            "The Arc Canal — a measured study of the ground and the design:",
          )}
          locale={locale}
          className="my-3"
        />

        {/*
          صورتان على هذه الصفحة، وكلتاهما مولَّدة. كان تحت كلٍّ منهما سطرٌ
          يقول ذلك، وحذفه المالك في 2 أكتوبر («احذف التعليقات من الصور كلها»)؛
          والنصّ البديل (`alt`) يصف ما في الصورة ولا يزعم أنّها القناة.

          They sit below the opening paragraph rather than above the title, so
          the first thing on the page stays the sentence that says what this is.
        */}
        <SectionPhoto
          className="overflow-hidden rounded-xl border border-border"
          src={PHOTOS.nileDam}
          alt={t(
            "سدّ خرسانيّ على نهر واسع، وخزانه خلفه، وأرض قاحلة حوله",
            "A concrete dam on a wide river, its reservoir behind it and dry land around",
          )}
        />
      </header>

      {/*
        فيلم سوداقري (المالك، 2 أكتوبر: «بعدما تكمل اللقطات نزّلها في صفحة القناة»):
        الماء من السدّ إلى القناة إلى الحقل، والمزارع، ثمّ الشعار. Generated,
        like the two pictures, and without a caption like them. It plays only
        when asked, with its narration, and is watched here, not saved
        (FilmPlayer).
      */}
      <figure>
        <FilmPlayer
          base="/video/canal-film"
          poster="/video/canal-film.jpg"
          label={t("فيلم سوداقري: من الماء تبدأ الحياة", "A Sudagri film: life begins with water")}
        />
      </figure>

      {/* The two earlier water films, from the homepage to the canal they tell of (the owner, 4 October). */}
      <div className="grid gap-4 sm:grid-cols-2">
        <figure>
          <FilmPlayer
            base="/video/film-wide"
            poster="/video/film-wide.jpg"
            label={t("فيلم سوداقري: من السدّ إلى الحقل", "A Sudagri film: from the dam to the field")}
          />
        </figure>
        <figure>
          <FilmPlayer
            base="/video/promo-wide"
            poster="/video/promo-wide.jpg"
            label={t("فيلم سوداقري: من الماء تبدأ الحياة", "A Sudagri film: life begins with water")}
          />
        </figure>
      </div>

      {/* The four numbers the whole study turns on. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [`${Math.round(ROUTE_LENGTH_KM)} ${t("كم", "km")}`, t("طول المسار", "Route length"), t("بين طرفيه المسمّيين", "between its two named ends")],
          [`${summary.peak.elevation} ${t("م", "m")}`, t("أعلى نقطة", "Highest point"), t("على الساق الجنوبية", "on the southern leg")],
          [`${summary.liftM} ${t("م", "m")}`, t("الرفع الساكن", "Static lift"), t("من منسوب الخزان ٣٧٧", "from the reservoir level of 377")],
          [
            `${summary.terminusAboveSourceM} ${t("م", "m")}`,
            t("النهاية فوق المصدر", "End above the source"),
            t("فلا جريان بالجاذبية", "so no gravity flow"),
          ],
        ].map(([big, label, note]) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card p-3 text-center"
          >
            <div className="text-xl font-bold">{big}</div>
            <div className="text-sm font-medium">{label}</div>
            <div className="mt-1 text-xs text-muted">{note}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <h2 className="mb-3 text-lg font-semibold">{t("الخلاصة", "The conclusion")}</h2>
        {en ? (
          <>
            <p className="leading-relaxed">
              The site is sound and the idea is buildable as engineering. But the ground{" "}
              <strong>rises from the start of the route to its end</strong> — no point on the arc is lower than the
              reservoir level — so the whole project is a pumping project, with four pumping stations and installed
              capacity measured in hundreds of megawatts at half a million feddan.
            </p>
            <p className="mt-3 leading-relaxed">
              That makes the project&apos;s size the question, not its location. Our design and cost figures below
              show that <strong>the southern core</strong> — twenty thousand feddan directly west of the reservoir,
              where the ground is at water level — needs a canal two metres deep, one pumping station and one
              megawatt of solar, instead of a canal nine metres deep and forty-seven wide with four stations.
            </p>
          </>
        ) : (
          <>
        <p className="leading-relaxed">
          الموقع سليم والفكرة قابلة للتنفيذ هندسياً. لكن الأرض{" "}
          <strong>ترتفع من أوّل المسار إلى آخره</strong> — لا نقطة على القوس
          أدنى من منسوب الخزان — فالمشروع كلّه مشروع ضخّ، بأربع محطات رفع وقدرة
          مركّبة تُقاس بمئات الميغاواطات عند نصف مليون فدان.
        </p>
        <p className="mt-3 leading-relaxed">
          وهذا يجعل حجم المشروع هو المسألة، لا موضعه. أرقامنا للتصميم والكلفة في
          الأسفل تبيّن أن <strong>النواة الجنوبية</strong> — عشرون ألف فدان غرب
          الخزان مباشرةً، حيث الأرض على منسوب الماء — تحتاج قناةً بعُمق مترين
          ومحطّة رفع واحدة وميغاواطاً شمسياً واحداً، بدل قناةٍ بعُمق تسعة أمتار
          وعرض سبعةٍ وأربعين وأربع محطات.
        </p>
          </>
        )}
      </section>

      {/* The ground. */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{t("الأرض — واحدٌ وأربعون قياساً", "The ground — forty-one measurements")}</h2>
          <p className="leading-relaxed text-muted">
            {en
              ? `We measured the route from the SRTM satellite at thirty-metre resolution, forty-one points from Jebel Aulia to Sarurab. The arc is a semicircle on the chord between the two ends — radius 30 km and length π×30 ≈ ${Math.round(ROUTE_LENGTH_KM)} km — and its westernmost point is at ${west.lon.toFixed(3)}°E, about 28 km west of Omdurman.`
              : `قِسنا المسار من قمر SRTM بدقّة ثلاثين متراً، إحدى وأربعين نقطة من جبل أولياء إلى السروراب. القوس نصف دائرة على الوتر بين الطرفين — نصف قطرها ٣٠ كم وطولها π×٣٠ ≈ ${Math.round(ROUTE_LENGTH_KM)} كم — وأقصى غربها عند ${west.lon.toFixed(3)}°ق، أي نحو ٢٨ كم غرب أم درمان.`}
          </p>
        </div>

        {/*
          The route on the live map (البند ١٤٧), on the satellite by default:
          the river, the reservoir and the fields it would water are what a
          reader looks for here. The drawn map under it stays — it is the
          study's figure, with the ground's height that the satellite cannot show.
        */}
        <MapScreen
          themes={mapThemes(null, [], locale).filter((x) => x.key === "canal")}
          initial="none"
          initialOver={["canal"]}
          bounds={[
            [32.16, 15.2],
            [32.6, 15.84],
          ]}
          initialGround="sat"
          address={false}
          full="/map?layer=none&over=canal"
          className="h-[70vh] min-h-80"
        />
        <p className="-mt-3 text-xs text-muted">
          {t(
            "الخريطة الحيّة: بدّل بين صورة القمر الصناعيّ والخريطة بالزرّ على اليمين. وتحتها الخريطة المرسومة بالقياسات.",
            "The live map: switch between the satellite image and the map with the button on the right. Below it, the map drawn from the measurements.",
          )}
        </p>

        <ArcCanalMap locale={locale} />

        <ArcCanalProfile />

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-2 font-semibold">{t("أين تبدأ الأرض المنخفضة", "Where the low ground begins")}</h3>
          {en ? (
            <>
              <p className="leading-relaxed">
                Directly west of the Jebel Aulia reservoir the ground stands at <strong>377–394 metres</strong> for
                about twelve kilometres — almost at the water level itself — and the serious climb does not start
                before that. At the northern end it is the opposite: the Nile at Sarurab is at 381 m, five kilometres
                west the ground reaches <strong>409 m</strong>, and at thirty, 451 m.
              </p>
              <p className="mt-2 leading-relaxed text-muted">
                This measurement corrected a proposal we ourselves published on this page earlier: we had put the
                first core at Sarurab &ldquo;where the lift is a few metres&rdquo;. The ground says the lift there is
                28 metres within five kilometres, and that the low ground is in the south, not the north.
              </p>
            </>
          ) : (
            <>
          <p className="leading-relaxed">
            غرب خزان جبل أولياء مباشرةً تقف الأرض على{" "}
            <strong>٣٧٧–٣٩٤ متراً</strong> على امتداد نحو اثني عشر كيلومتراً —
            أي بمنسوب الماء نفسه تقريباً — ولا يبدأ الصعود الجادّ قبل ذلك. وعند
            الطرف الشمالي العكس: النيل عند السروراب على ٣٨١ م، وعلى بُعد خمسة
            كيلومترات غرباً تبلغ الأرض <strong>٤٠٩ م</strong>، وعند الثلاثين
            ٤٥١ م.
          </p>
          <p className="mt-2 leading-relaxed text-muted">
            وهذا القياس صحّح اقتراحاً نشرناه نحن على هذه الصفحة من قبل: كنّا
            نضع النواة الأولى عند السروراب «حيث الرفع بضعة أمتار». الأرض تقول إن
            الرفع هناك ٢٨ متراً خلال خمسة كيلومترات، وإن الأرض المنخفضة في
            الجنوب لا الشمال.
          </p>
            </>
          )}
        </div>
      </section>

      <ArcCanalCorridor locale={locale} />

      <ArcCanalGallery locale={locale} />

      <ArcCanalWater locale={locale} />

      <ArcCanalDesign locale={locale} />

      <ArcCanalDossier locale={locale} />

      {/* The point of the page. */}
      <section className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
        <h2 className="text-xl font-semibold">
          {t("النواة القابلة للاستثمار — اليوم، لا بعد عشر سنوات", "The investable core — today, not in ten years")}
        </h2>

        <SectionPhoto
          className="overflow-hidden rounded-xl border border-border"
          src={PHOTOS.canalRegulator}
          alt={t(
            "قنطرة خرسانية ببوابات فولاذية على ترعة ريّ، والماء الطيني يمرّ تحتها",
            "A concrete regulator with steel gates on an irrigation canal, muddy water flowing beneath it",
          )}
        />

        {en ? (
          <p className="leading-relaxed">
            Every difficulty in the numbers above is a difficulty of <strong>size</strong>, not of the idea. The
            installed power, the water allocation, the canal&apos;s depth, flooding the vegetable market — all of them
            come from the half-million feddan. Divide it by twenty-five, and they all disappear.
          </p>
        ) : (
        <p className="leading-relaxed">
          كل صعوبة في الأرقام أعلاه صعوبةٌ في <strong>الحجم</strong>، لا في
          الفكرة. القدرة المركّبة، والحصة المائية، وعمق القناة، وإغراق سوق
          الخضر — كلّها تنشأ من نصف المليون فدان. اقسمها على خمسة وعشرين،
          فتختفي كلّها.
        </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [t("٢٠ ألف فدان", "20,000 feddan"), t("بدل ٥٠٠ ألف", "instead of 500,000")],
            [t("٢–٣ مليون $", "$2–3 million"), t("بدل ٣٢١–٧٥٥ مليون", "instead of 321–755 million")],
            [t("٤٢ مليون م³", "42 million m³"), t("بدل ١٫٠٥–١٫٧٢ مليار", "instead of 1.05–1.72 billion")],
          ].map(([big, small]) => (
            <div
              key={big}
              className="rounded-lg border border-border bg-card p-3 text-center"
            >
              <div className="text-lg font-bold">{big}</div>
              <div className="text-xs text-muted">{small}</div>
            </div>
          ))}
        </div>

        {en ? (
          <ul className="flex list-disc flex-col gap-2 ps-5 leading-relaxed">
            <li>
              <strong>At the southern end, directly west of the Jebel Aulia reservoir</strong> — where the ground is
              at water level, so the lift is about six metres and one station is enough.
            </li>
            <li>
              <strong>Drip, not flood</strong> — 2,096 m³ per feddan against 3,430, which shrinks the canal, the
              station and the solar array together.
            </li>
            <li>
              <strong>Solar, not the grid</strong> — one megawatt peak covers the whole year&apos;s pumping, so no
              decision is needed on a grid that cannot carry hundreds of megawatts.
            </li>
            <li>
              <strong>And no sovereign decree on a water allocation is needed</strong> at this size.
            </li>
          </ul>
        ) : (
        <ul className="flex list-disc flex-col gap-2 ps-5 leading-relaxed">
          <li>
            <strong>عند الطرف الجنوبي، غرب خزان جبل أولياء مباشرةً</strong> —
            حيث الأرض على منسوب الماء، فالرفع يقارب الستّة أمتار ومحطّة واحدة
            تكفيه.
          </li>
          <li>
            <strong>ريّ بالتنقيط لا بالغمر</strong> — ٢٬٠٩٦ م³ للفدان مقابل
            ٣٬٤٣٠، وهو ما يصغّر القناة والمحطّة والمصفوفة الشمسية معاً.
          </li>
          <li>
            <strong>طاقة شمسية لا شبكة</strong> — ميغاواط واحد ذروةً يغطّي ضخّ
            السنة كلّها، فلا حاجة إلى قرارٍ في شبكةٍ لا تحتمل مئات
            الميغاواطات.
          </li>
          <li>
            <strong>ولا حاجة إلى مرسوم سيادي بحصة مائية</strong> عند هذا الحجم.
          </li>
        </ul>
        )}

        {en ? (
          <p className="leading-relaxed">
            Most important, this core produces yields, costs and water use that are <em>measured</em> rather than
            estimated — and sells a crop meanwhile. It alone turns the rest of the numbers on this page from a
            calculation into an experiment.
          </p>
        ) : (
        <p className="leading-relaxed">
          والأهم أن هذه النواة تُنتج غلّةً وتكاليفَ واستهلاكَ ماءٍ{" "}
          <em>مقيسة</em> بدل أن تُقدَّر — ثم تبيع محصولاً أثناء ذلك. وهي وحدها
          ما يحوّل بقيّة الأرقام على هذه الصفحة من حسابٍ إلى تجربة.
        </p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">
          {t("مهتمّ بالنواة الأولى؟ اترك اسمك", "Interested in the first core? Leave your name")}
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          {t(
            "لا نجمع مالاً على هذه الصفحة ولا نعرض حصصاً. نجمع أسماء من يريد أن يُبلَّغ حين تكتمل دراسة النواة التفصيلية بأرقامها الميدانية.",
            "We raise no money on this page and offer no shares. We collect the names of those who want to be told when the detailed study of the core is complete with its field figures.",
          )}
        </p>
        <NotifyMeForm interest="القناة القوسية — النواة الأولى" />
      </section>

      <section className="flex flex-col gap-3 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">
          {t("من أين جاءت الأرقام", "Where the numbers came from")}
        </h2>
        {en ? (
          <>
            <p className="leading-relaxed">
              Elevations from 30 m SRTM via OpenTopoData, and the Nile&apos;s course from OpenStreetMap and its
              contributors (ODbL). Climate from NASA POWER — MERRA-2. Soil from ISRIC SoilGrids at 250 m. Yield and
              export unit value from the FAOSTAT data loaded into the platform.
            </p>
            <p className="leading-relaxed">
              The water need is computed with the platform&apos;s own FAO-56 engine — the engine behind the{" "}
              <Link href="/tools/water" className="text-primary underline">
                water requirement calculator
              </Link>{" "}
              — the cross-section with Manning&apos;s equation, power with ρgQH, and cost as quantities times stated
              unit rates. You can redo every one of these calculations yourself.
            </p>
            <p className="leading-relaxed">
              This is Sudagri&apos;s study alone, and it does not represent any official body or the project&apos;s
              owners.
            </p>
          </>
        ) : (
          <>
        <p className="leading-relaxed">
          الارتفاعات من SRTM ٣٠ متراً عبر OpenTopoData، ومجرى النيل من
          OpenStreetMap ومساهميه (ODbL). المناخ من NASA POWER — MERRA-2. التربة
          من ISRIC SoilGrids على ٢٥٠ متراً. الغلّة وقيمة الوحدة التصديرية من
          FAOSTAT المحمَّلة داخل المنصّة.
        </p>
        <p className="leading-relaxed">
          والاحتياج المائي محسوب بمحرّك FAO-56 داخل المنصّة نفسها — وهو المحرّك
          الذي تعمل به{" "}
          <Link href="/tools/water" className="text-primary underline">
            حاسبة الاحتياج المائي
          </Link>{" "}
          — والمقطع بمعادلة مانينغ، والقدرة بـρgQH، والكلفة بكميّاتٍ مضروبةٍ في
          أسعار وحدةٍ مذكورة. يمكنك أن تعيد كل حساب منها بنفسك.
        </p>
        <p className="leading-relaxed">
          هذه دراسة سوداقري وحدها، ولا تمثّل جهةً رسمية ولا أصحاب المشروع.
        </p>
          </>
        )}
      </section>
    </main>
  );
}
