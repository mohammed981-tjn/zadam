import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { recordCorridorReview } from "./actions";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { referenceName } from "@/lib/exportOffers";

export const metadata = { title: "مراجعة قواعد الممرّات | سوداقري" };

const date = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

interface CorridorRow {
  id: string;
  commodity: { code: string; name_ar: string } | null;
  destination: { code: string; name_ar: string } | null;
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
  if (!user) redirect(await loginHrefHere());

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const { data: corridorRows } = await supabase
    .from("export_corridors")
    .select(
      "id, commodity:export_commodities(code, name_ar), destination:export_destinations(code, name_ar)",
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
      <h1 className="text-2xl font-bold">{t("مراجعة قواعد الممرّات", "Corridor rule reviews")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
        {locale === "en" ? (
          <>
            The requirements table records <strong>when a rule takes effect</strong>, not{" "}
            <strong>when a person last confirmed it is still the rule</strong>. Only the second is a basis for
            telling a farmer their consignment is ready — and regulations change by announcement, not on a
            schedule, so only someone who did the work and said what they checked against can fill in that date.
          </>
        ) : (
          <>
            جدولُ المتطلّبات يسجّل <strong>متى تسري القاعدة</strong>، ولا يسجّل{" "}
            <strong>متى تأكّد إنسانٌ أنّها ما تزال القاعدة</strong>. والثاني وحده
            أساسٌ لأن نقول لمزارعٍ إنّ إرساليته جاهزة — واللوائحُ تتغيّر بإعلانٍ لا
            بجدول، فلا يملأ هذا التاريخَ إلّا مَن فعل العمل وقال على أيّ شيءٍ راجع.
          </>
        )}
      </p>

      <p className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
        {overdue > 0 ? (
          locale === "en" ? (
            <>
              <strong className="text-danger">{overdue}</strong> of {corridors.length} corridors are past the
              review interval ({interval} days).
            </>
          ) : (
            <>
              <strong className="text-danger">{overdue}</strong> من{" "}
              {corridors.length} ممرّاً تجاوزت مدّةَ المراجعة ({interval} يوماً).
            </>
          )
        ) : (
          <>{t(`كلُّ الممرّات (${corridors.length}) ضمن مدّة المراجعة.`, `All corridors (${corridors.length}) are within the review interval.`)}</>
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
                {c.commodity ? referenceName(c.commodity.code, c.commodity.name_ar, locale) : "—"}{" "}
                {locale === "en" ? "→" : "←"}{" "}
                {c.destination ? referenceName(c.destination.code, c.destination.name_ar, locale) : "—"}
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
                    ? t(`متأخّرة · ${s.days_since} يوماً`, `Overdue · ${s.days_since} days`)
                    : t(`رُوجعت قبل ${s.days_since} يوماً`, `Reviewed ${s.days_since} days ago`)
                  : t("لم تُراجَع قطّ", "Never reviewed")}
              </span>
            </div>

            {s?.last_reviewed_at ? (
              <p className="mt-2 text-sm text-muted">
                {t("آخرُ مراجعة", "Last review")} {date(s.last_reviewed_at, locale)} · {s.reviewed_count}{" "}
                {t("مراجعةً في السجلّ", "reviews in the log")}
                {s.source_note && (
                  <span className="block">{t("على:", "Against:")} {s.source_note}</span>
                )}
              </p>
            ) : (
              <p className="mt-2 text-sm text-danger">
                {t("لا شيءَ في السجلّ — والقواعدُ تُعرض للمزارعين كما هي.", "Nothing in the log — and the rules are shown to farmers as they stand.")}
              </p>
            )}

            <form
              action={recordCorridorReview}
              className="mt-4 flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="corridor_id" value={c.id} />
              <label className="flex-1 text-xs">
                <span className="mb-1 block text-muted">
                  {t("المصدرُ الذي راجعتَ عليه", "The source you checked against")}
                </span>
                <input
                  name="source_note"
                  required
                  minLength={10}
                  placeholder={t(
                    "مثال: لائحة الاتّحاد الأوروبي 2026/45 — فُحصت المستنداتُ الثمانية",
                    "e.g. EU regulation 2026/45 — all eight documents checked",
                  )}
                  className={`${field} min-w-56`}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-muted">{t("النتيجة", "Outcome")}</span>
                <select name="outcome" className={field} defaultValue="unchanged">
                  <option value="unchanged">{t("لم تتغيّر", "Unchanged")}</option>
                  <option value="amended">{t("عُدِّلت القواعد", "Rules amended")}</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {t("سجّل المراجعة", "Record the review")}
              </button>
            </form>

            {/* ولا زرَّ حذفٍ ولا تعديل: السجلُّ يُلحَق، وزنادٌ في القاعدة يرفع
                على من يحاول. وشهادةٌ يجوز تعديلُها ليست شهادة. */}
            <p className="mt-2 text-xs text-muted">
              {t(
                "المراجعاتُ تُلحَق ولا تُعدَّل. وإن تغيّرت القواعدُ فعدّلها في جدولها، ثمّ سجّل مراجعةً بنتيجة «عُدِّلت».",
                "Reviews are appended, never edited. If the rules changed, amend them in their table, then record a review with the outcome “amended”.",
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
