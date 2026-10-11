import { createClient } from "@/lib/supabase/server";
import type {
  ArcCanalFact,
  ArcCanalFactCategory,
  ArcCanalFactStatus,
} from "@/types/database";
import { tr, type Locale } from "@/lib/i18n";

/**
 * ملف القناة — كل ما نعرفه عنها، وكل ما لا نعرفه.
 *
 * Read from arc_canal_facts rather than written into this file, for the reason
 * the migration gives at length: measurement belongs in a table. The practical
 * consequence is that correcting a figure here is an update, not a deploy, and
 * that anything else on the platform — the assistant included — can answer from
 * the same rows the reader is looking at.
 *
 * THE BLANKS ARE THE POINT
 *
 * Sixteen of these rows have no value. There is no soil survey, no permit, no
 * water allocation, no tariff. A dossier that listed only the answered rows
 * would read as a project that has been studied; this one shows a project that
 * has been described. Those rows are rendered in the same table as the rest,
 * not in a footnote, because a reader who has to go looking for what is missing
 * will not go looking.
 */

const CATEGORY_LABEL_EN: Record<ArcCanalFactCategory, string> = {
  terrain: "Terrain",
  engineering: "Engineering",
  area: "Area",
  climate: "Climate",
  water: "Water",
  energy: "Energy",
  operations: "Operations",
  permits: "Permits",
  cost: "Cost",
};

const STATUS_EN: Record<ArcCanalFactStatus, string> = {
  measured: "Measured",
  derived: "Computed",
  assumption: "Assumption",
  unknown: "Unknown",
};

const CATEGORY_LABEL: Record<ArcCanalFactCategory, string> = {
  terrain: "التضاريس",
  engineering: "الهندسة",
  area: "المساحة",
  climate: "المناخ",
  water: "المياه",
  energy: "الطاقة",
  operations: "التشغيل",
  permits: "التصاريح",
  cost: "التكلفة",
};

/** The order the dossier reads in: ground first, paperwork last. */
const CATEGORY_ORDER: ArcCanalFactCategory[] = [
  "terrain",
  "engineering",
  "area",
  "climate",
  "water",
  "energy",
  "operations",
  "permits",
  "cost",
];

const STATUS: Record<
  ArcCanalFactStatus,
  { label: string; className: string }
> = {
  measured: {
    label: "مقيس",
    className: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  },
  derived: {
    label: "محسوب",
    className: "bg-primary/10 text-primary",
  },
  assumption: {
    label: "فرضية",
    className: "bg-amber-600/10 text-amber-800 dark:text-amber-300",
  },
  unknown: {
    label: "غير معروف",
    className: "bg-danger/10 text-danger",
  },
};

export default async function ArcCanalDossier({ locale = "ar" }: { locale?: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  // The rows are written in Arabic; on the English page they keep their own direction.
  const arabic = en ? ({ lang: "ar", dir: "rtl" } as const) : {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("arc_canal_facts")
    .select("id, category, key, label, value, unit, status, source, note, sort_order")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const facts = (data ?? []) as ArcCanalFact[];
  if (facts.length === 0) return null;

  const unknown = facts.filter((f) => f.status === "unknown").length;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{t("ملفّ القناة في قاعدة سوداقري", "The canal's file in Sudagri's database")}</h2>
        {en ? (
          <p className="leading-relaxed text-muted">
            Every technical, terrain or operational item about the project, in a table that is updated rather than
            republished. Each item carries its status: <strong>measured</strong> from an open source,{" "}
            <strong>computed</strong> by a stated method, an <strong>assumption</strong> we chose so its effect can be
            seen, or <strong>unknown</strong>. The items themselves are recorded in Arabic.
          </p>
        ) : (
          <p className="leading-relaxed text-muted">
            كل بند تقني أو تضاريسي أو تشغيلي عن المشروع، في جدول يُحدَّث ولا
            يُعاد نشره. وكل بند يحمل حالته: <strong>مقيس</strong> من مصدر مفتوح،
            أو <strong>محسوب</strong> بمنهج مذكور، أو <strong>فرضية</strong>
            اخترناها ليُرى أثرها، أو <strong>غير معروف</strong>.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 leading-relaxed">
        <h3 className="mb-2 font-semibold">
          {en
            ? `What is still unknown — and ${unknown} of these items are not things that can be measured`
            : `ما بقي غير معروف — و${unknown} بنداً منه ليست ممّا يُقاس`}
        </h3>
        {en ? (
          <>
            <p>
              This table used to have sixteen blank items. Six of them were not unknown but unfetched: the soil,
              seepage, discharge, cross-section, pumping stations and power source — fetched from SoilGrids and NASA
              POWER or computed from them, and now in the table below with their figures.
            </p>
            <p className="mt-3">
              What is still blank after that is of another kind:{" "}
              <strong>a water permit, a land allocation, an environmental impact assessment, a tariff, and an
              operator</strong> — these are signatures, not measurements, and no satellite issues a permit. With them
              are two items that need a hand in the soil: test pits, and an exchangeable-sodium test. Each of them
              now says exactly what would settle it.
            </p>
          </>
        ) : (
          <>
        <p>
          كان في هذا الجدول ستة عشر بنداً فارغاً. ستّة منها لم تكن مجهولة بل غير
          مجلوبة: التربة والتسرّب والتصرّف والمقطع ومحطات الرفع ومصدر الطاقة —
          جُلبت من SoilGrids وNASA POWER أو حُسبت منهما، وهي في الجدول أدناه
          بأرقامها.
        </p>
        <p className="mt-3">
          وما بقي فارغاً بعد ذلك من نوع آخر: <strong>إذن مياه، وتخصيص أرض،
          وتقييم أثر بيئي، وتعرفة، وجهة مشغّلة</strong> — هذه توقيعاتٌ لا
          قياسات، ولا قمر صناعي يُصدر تصريحاً. ومعها بندان يحتاجان يداً في
          التربة: الحفر الاختباري، وفحص الصوديوم المتبادل. وكل بند منها يقول
          الآن ما الذي يحسمه بالضبط.
        </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {CATEGORY_ORDER.map((category) => {
          const rows = facts.filter((f) => f.category === category);
          if (rows.length === 0) return null;

          return (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="font-semibold">{en ? CATEGORY_LABEL_EN[category] : CATEGORY_LABEL[category]}</h3>
              <ul className="flex flex-col gap-2">
                {rows.map((f) => (
                  <li
                    key={f.key}
                    className={`rounded-xl border p-4 ${
                      f.status === "unknown"
                        ? "border-dashed border-danger/40"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium" {...arabic}>
                        {f.label}
                      </span>
                      {f.value === null ? (
                        <span className="text-sm text-danger">
                          {t("لم يُحدَّد بعد", "Not yet determined")}
                        </span>
                      ) : (
                        <span className="text-lg font-bold" {...arabic}>
                          {f.value}
                          {f.unit && (
                            <span className="ps-1 text-sm font-normal text-muted">
                              {f.unit}
                            </span>
                          )}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS[f.status].className}`}
                      >
                        {en ? STATUS_EN[f.status] : STATUS[f.status].label}
                      </span>
                      {f.status !== "unknown" && (
                        <span className="text-xs text-muted" {...arabic}>
                          {f.source}
                        </span>
                      )}
                    </div>
                    {f.note && (
                      <p className="mt-2 text-sm leading-relaxed text-muted" {...arabic}>
                        {f.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
