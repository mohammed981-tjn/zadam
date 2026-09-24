import Link from "next/link";
import RainMap from "@/components/RainMap";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import WeekForecast from "@/components/WeekForecast";
import { fetchRainGrid } from "@/lib/rainMap";

export const metadata = {
  title: "توقّع الأمطار | سودجري",
  description:
    "خريطة السودان بمجموع المطر المتوقّع للأيام السبعة القادمة، باللون والرقم، ومقارنتُه بحاجة الجوّ في كل محطة.",
};

// The map is one cached upstream request; rebuilding the page on the same
// three-hour clock keeps the HTML and the data the same age.
export const revalidate = 10800;

const dayMonth = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("ar", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Khartoum",
  });

export default async function RainPage() {
  const grid = await fetchRainGrid();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">توقّع الأمطار</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        مجموعُ المطر المتوقّع في الأيام السبعة القادمة على كل مربّعٍ من السودان
        (نحو ١٦٠ كم للضلع). اللونُ يُريك أين المطر، والرقمُ كم مليمتراً. هو
        توقّعٌ من نماذج الأرصاد لا قياس، ويُحدَّث كل ثلاث ساعات.
      </p>
      <ShareWhatsApp
        path="/rain"
        text="توقّع الأمطار في السودان للأيام السبعة القادمة — خريطة بالأرقام:"
        className="my-3"
      />

      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-6">
        {grid ? (
          <>
            <p className="mb-3 text-sm font-medium">
              من {dayMonth(grid.from)} إلى {dayMonth(grid.to)}
            </p>
            <RainMap grid={grid} />
          </>
        ) : (
          <p className="text-sm text-muted">
            تعذّر جلبُ التوقّع الآن. أعد المحاولة بعد قليل.
          </p>
        )}
      </section>

      <WeekForecast />

      <p className="mt-8 text-sm">
        تريد أن تعرف كم يحتاج محصولك من الماء بعد هذا المطر؟{" "}
        <Link href="/tools/water" className="font-medium text-primary underline">
          افتح حاسبة الاحتياج المائي
        </Link>
      </p>
    </div>
  );
}
