import Link from "next/link";
import NotifyMeForm from "@/components/NotifyMeForm";
import ArcCanalProfile from "@/components/ArcCanalProfile";
import ArcCanalMap from "@/components/ArcCanalMap";
import ArcCanalWater from "@/components/ArcCanalWater";
import ArcCanalDesign from "@/components/ArcCanalDesign";
import ArcCanalDossier from "@/components/ArcCanalDossier";
import ArcCanalGallery from "@/components/ArcCanalGallery";
import { summarise, ROUTE_LENGTH_KM, ROUTE } from "@/lib/arcCanal";

export const metadata = {
  title: "القناة القوسية — دراسة سودجري | سودجري",
};

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

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-4">
        <p className="text-sm text-muted">دراسة سودجري · قياس وحساب</p>
        <h1 className="text-3xl font-bold leading-tight">
          القناة القوسية — دراسة الأرض والتصميم
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          قناة تدور غرب أم درمان من خزان جبل أولياء جنوباً إلى السروراب شمالاً،
          لريّ أرضٍ غرب المدينة. نزلنا على المسار وقِسناه، وحسبنا احتياجه المائي
          وتصميمه الهندسي وكلفته من الكميّات. كل رقم هنا مقيسٌ أو محسوب، ومصدره
          ومنهجه مذكوران معه.
        </p>
      </header>

      {/* The four numbers the whole study turns on. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [`${Math.round(ROUTE_LENGTH_KM)} كم`, "طول المسار", "بين طرفيه المسمّيين"],
          [`${summary.peak.elevation} م`, "أعلى نقطة", "على الساق الجنوبية"],
          [`${summary.liftM} م`, "الرفع الساكن", "من منسوب الخزان ٣٧٧"],
          [
            `${summary.terminusAboveSourceM} م`,
            "النهاية فوق المصدر",
            "فلا جريان بالجاذبية",
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
        <h2 className="mb-3 text-lg font-semibold">الخلاصة</h2>
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
      </section>

      {/* The ground. */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">الأرض — واحدٌ وأربعون قياساً</h2>
          <p className="leading-relaxed text-muted">
            قِسنا المسار من قمر SRTM بدقّة ثلاثين متراً، إحدى وأربعين نقطة من
            جبل أولياء إلى السروراب. القوس نصف دائرة على الوتر بين الطرفين — نصف
            قطرها ٣٠ كم وطولها π×٣٠ ≈ {Math.round(ROUTE_LENGTH_KM)} كم — وأقصى
            غربها عند {west.lon.toFixed(3)}°ق، أي نحو ٢٨ كم غرب أم درمان.
          </p>
        </div>

        <ArcCanalMap />

        <ArcCanalProfile />

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-2 font-semibold">أين تبدأ الأرض المنخفضة</h3>
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
        </div>
      </section>

      <ArcCanalGallery />

      <ArcCanalWater />

      <ArcCanalDesign />

      <ArcCanalDossier />

      {/* The point of the page. */}
      <section className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
        <h2 className="text-xl font-semibold">
          النواة القابلة للاستثمار — اليوم، لا بعد عشر سنوات
        </h2>

        <p className="leading-relaxed">
          كل صعوبة في الأرقام أعلاه صعوبةٌ في <strong>الحجم</strong>، لا في
          الفكرة. القدرة المركّبة، والحصة المائية، وعمق القناة، وإغراق سوق
          الخضر — كلّها تنشأ من نصف المليون فدان. اقسمها على خمسة وعشرين،
          فتختفي كلّها.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["٢٠ ألف فدان", "بدل ٥٠٠ ألف"],
            ["٢–٣ مليون $", "بدل ٣٢١–٧٥٥ مليون"],
            ["٤٢ مليون م³", "بدل ١٫٠٥–١٫٧٢ مليار"],
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

        <ul className="flex list-disc flex-col gap-2 pr-5 leading-relaxed">
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

        <p className="leading-relaxed">
          والأهم أن هذه النواة تُنتج غلّةً وتكاليفَ واستهلاكَ ماءٍ{" "}
          <em>مقيسة</em> بدل أن تُقدَّر — ثم تبيع محصولاً أثناء ذلك. وهي وحدها
          ما يحوّل بقيّة الأرقام على هذه الصفحة من حسابٍ إلى تجربة.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">
          مهتمّ بالنواة الأولى؟ اترك اسمك
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          لا نجمع مالاً على هذه الصفحة ولا نعرض حصصاً. نجمع أسماء من يريد أن
          يُبلَّغ حين تكتمل دراسة النواة التفصيلية بأرقامها الميدانية.
        </p>
        <NotifyMeForm interest="القناة القوسية — النواة الأولى" />
      </section>

      <section className="flex flex-col gap-3 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">
          من أين جاءت الأرقام
        </h2>
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
          هذه دراسة سودجري وحدها، ولا تمثّل جهةً رسمية ولا أصحاب المشروع.
        </p>
      </section>
    </main>
  );
}
