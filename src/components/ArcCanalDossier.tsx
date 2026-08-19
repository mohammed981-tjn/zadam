import { createClient } from "@/lib/supabase/server";
import type {
  ArcCanalFact,
  ArcCanalFactCategory,
  ArcCanalFactStatus,
} from "@/types/database";

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
  study_claim: {
    label: "من الدراسة",
    className: "bg-amber-600/10 text-amber-800 dark:text-amber-300",
  },
  unknown: {
    label: "غير معروف",
    className: "bg-danger/10 text-danger",
  },
};

export default async function ArcCanalDossier() {
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
        <h2 className="text-xl font-semibold">ملفّ القناة في قاعدة سودجري</h2>
        <p className="leading-relaxed text-muted">
          كل بند تقني أو تضاريسي أو تشغيلي عن المشروع، في جدول يُحدَّث ولا
          يُعاد نشره. وكل بند يحمل حالته: مقيس، أو محسوب، أو منقول عن الدراسة،
          أو <strong>غير معروف</strong> — و{unknown} بنداً من{" "}
          {facts.length} ما زالت في الخانة الأخيرة.
        </p>
      </div>

      <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 leading-relaxed">
        <h3 className="mb-2 font-semibold">لماذا نعرض ما لا نعرفه</h3>
        <p>
          لا يوجد مسح تربة، ولا دراسة جيوتقنية، ولا تقييم أثر بيئي، ولا إذن مياه،
          ولا قرار تخصيص أرض، ولا تعرفة مياه. هذه البنود هي التي تقرّر إن كان
          المشروع قابلاً للتنفيذ أصلاً، ومَن يقرأ ملفّاً لا تظهر فيه سيفترض
          أنها موجودة. فبقاؤها في الجدول فارغةً أصدق من حذفها.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {CATEGORY_ORDER.map((category) => {
          const rows = facts.filter((f) => f.category === category);
          if (rows.length === 0) return null;

          return (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="font-semibold">{CATEGORY_LABEL[category]}</h3>
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
                      <span className="font-medium">{f.label}</span>
                      {f.value === null ? (
                        <span className="text-sm text-danger">
                          لم يُحدَّد بعد
                        </span>
                      ) : (
                        <span className="text-lg font-bold">
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
                        {STATUS[f.status].label}
                      </span>
                      {f.status !== "unknown" && (
                        <span className="text-xs text-muted">{f.source}</span>
                      )}
                    </div>
                    {f.note && (
                      <p className="mt-2 text-sm leading-relaxed text-muted">
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
