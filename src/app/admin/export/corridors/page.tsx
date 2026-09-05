import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordCorridorReview } from "./actions";

export const metadata = { title: "مراجعة قواعد الممرّات | سودجري" };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

interface CorridorRow {
  id: string;
  commodity: { name_ar: string } | null;
  destination: { name_ar: string } | null;
}

interface Status {
  last_reviewed_at: string | null;
  reviewed_count: number;
  days_since: number | null;
  review_days: number;
  stale: boolean;
  source_note: string | null;
}

/**
 * مراجعةُ قواعد الممرّات — الشاشةُ التي تحوّل «لم يُراجَع» من فراغٍ إلى واجب.
 *
 * WHY THIS SCREEN LEADS WITH WHAT IS OVERDUE
 *
 * The requirements table records when a rule takes effect and never when a human
 * last confirmed it is still the rule. Those are different facts, and only the
 * second is a basis for telling a farmer their consignment is ready. Regulation
 * changes by announcement, not by feed, so nothing can supply that date except a
 * person doing the work and saying what they checked.
 *
 * A corridor nobody has ever reviewed sorts to the top and reads «لم تُراجَع
 * قطّ», not as a blank: an empty cell invites the eye to skip it, which is
 * exactly how a rule goes three years without anyone looking.
 */
export default async function AdminCorridorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const { data: corridorRows } = await supabase
    .from("export_corridors")
    .select(
      "id, commodity:export_commodities(name_ar), destination:export_destinations(name_ar)",
    );

  const corridors = (corridorRows ?? []) as unknown as CorridorRow[];

  const statuses = await Promise.all(
    corridors.map(async (c) => {
      const { data } = await supabase
        .rpc("export_corridor_rules_status", { p_corridor_id: c.id })
        .maybeSingle();
      return { corridor: c, status: data as Status | null };
    }),
  );

  // المتأخّرُ أوّلاً، ثمّ الأقدمُ مراجعةً. والترتيبُ هو نصفُ فائدة الشاشة.
  const sorted = [...statuses].sort((a, b) => {
    const as = a.status?.stale ? 1 : 0;
    const bs = b.status?.stale ? 1 : 0;
    if (as !== bs) return bs - as;
    return (b.status?.days_since ?? 9999) - (a.status?.days_since ?? 9999);
  });

  const overdue = sorted.filter((s) => s.status?.stale).length;
  const interval = statuses[0]?.status?.review_days ?? 180;

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">مراجعة قواعد الممرّات</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
        جدولُ المتطلّبات يسجّل <strong>متى تسري القاعدة</strong>، ولا يسجّل{" "}
        <strong>متى تأكّد إنسانٌ أنّها ما تزال القاعدة</strong>. والثاني وحده
        أساسٌ لأن نقول لمزارعٍ إنّ إرساليته جاهزة — واللوائحُ تتغيّر بإعلانٍ لا
        بجدول، فلا يملأ هذا التاريخَ إلّا مَن فعل العمل وقال على أيّ شيءٍ راجع.
      </p>

      <p className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
        {overdue > 0 ? (
          <>
            <strong className="text-danger">{overdue}</strong> من{" "}
            {corridors.length} ممرّاً تجاوزت مدّةَ المراجعة ({interval} يوماً).
          </>
        ) : (
          <>كلُّ الممرّات ({corridors.length}) ضمن مدّة المراجعة.</>
        )}
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {sorted.map(({ corridor: c, status: s }) => (
          <li key={c.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">
                {c.commodity?.name_ar ?? "—"} ← {c.destination?.name_ar ?? "—"}
              </h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${
                  s?.stale
                    ? "bg-danger/10 text-danger"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {s?.last_reviewed_at
                  ? s.stale
                    ? `متأخّرة · ${s.days_since} يوماً`
                    : `رُوجعت قبل ${s.days_since} يوماً`
                  : "لم تُراجَع قطّ"}
              </span>
            </div>

            {s?.last_reviewed_at ? (
              <p className="mt-2 text-sm text-muted">
                آخرُ مراجعة {date(s.last_reviewed_at)} · {s.reviewed_count}{" "}
                مراجعةً في السجلّ
                {s.source_note && (
                  <span className="block">على: {s.source_note}</span>
                )}
              </p>
            ) : (
              <p className="mt-2 text-sm text-danger">
                لا شيءَ في السجلّ — والقواعدُ تُعرض للمزارعين كما هي.
              </p>
            )}

            <form
              action={recordCorridorReview}
              className="mt-4 flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="corridor_id" value={c.id} />
              <label className="flex-1 text-xs">
                <span className="mb-1 block text-muted">
                  المصدرُ الذي راجعتَ عليه
                </span>
                <input
                  name="source_note"
                  required
                  minLength={10}
                  placeholder="مثال: لائحة الاتّحاد الأوروبي 2026/45 — فُحصت المستنداتُ الثمانية"
                  className={`${field} min-w-56`}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted">النتيجة</span>
                <select name="outcome" className={field} defaultValue="unchanged">
                  <option value="unchanged">لم تتغيّر</option>
                  <option value="amended">عُدِّلت القواعد</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                سجّل المراجعة
              </button>
            </form>

            {/* ولا زرَّ حذفٍ ولا تعديل: السجلُّ يُلحَق، وزنادٌ في القاعدة يرفع
                على من يحاول. وشهادةٌ يجوز تعديلُها ليست شهادة. */}
            <p className="mt-2 text-xs text-muted">
              المراجعاتُ تُلحَق ولا تُعدَّل. وإن تغيّرت القواعدُ فعدّلها في
              جدولها، ثمّ سجّل مراجعةً بنتيجة «عُدِّلت».
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
