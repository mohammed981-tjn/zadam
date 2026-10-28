import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CROPS } from "@/lib/agronomy";
import { computeTrust, type SeasonRecord } from "@/lib/trust";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

interface SeasonRow {
  season_id: string;
  name: string;
  crop_key: string;
  planting_date: string;
  status: "active" | "completed" | "abandoned";
  feddans: number;
  planned_budget: number;
  actual_costs: number;
  revenue: number;
  stages_total: number;
  stages_completed: number;
  stages_with_evidence: number;
  stages_dated: number;
  stages_on_time: number;
}

/**
 * الأرضُ التي وُثِّقت — والنصفُ الذي كان ناقصاً من هذه الصفحة.
 *
 * Readable by anyone, and not through any function: `lands_public_read` admits
 * `listed and verification = 'verified'` to `anon`. So this needs no
 * service-role key and no consent flag of its own — an administrator verified
 * the land and published it, and that decision is the consent.
 *
 * It matters because everything above it is a claim about a person. A buyer
 * asking «where is this farm» had no answer on this page, and a record with no
 * place attached to it is a reference, not a passport.
 */
/**
 * A row of public_farmer_lands(). A land its owner has offered to investors or
 * partner companies comes back by state only (`offered`), with no id, name,
 * locality or area — the passport must not undo the anonymity the offer
 * promises (backlog 127).
 */
interface VerifiedLand {
  id: string | null;
  name: string | null;
  state: string | null;
  locality: string | null;
  feddans: number | null;
  tenure: string;
  verification_note: string | null;
  offered: boolean;
}

const TENURE_LABEL: Record<string, string> = {
  owned: "مملوكة",
  leased: "مستأجرة",
  communal: "مشاع",
  unspecified: "غير محدّدة",
};

const TENURE_LABEL_EN: Record<string, string> = {
  owned: "Owned",
  leased: "Leased",
  communal: "Communal",
  unspecified: "Unspecified",
};

const CROP_EN: Record<string, string> = {
  wheat: "Wheat",
  sorghum: "Sorghum",
  maize: "Maize",
  cotton: "Cotton",
  groundnut: "Groundnut",
  sesame: "Sesame",
  alfalfa: "Alfalfa",
  onion: "Onion",
  tomato: "Tomato",
  sugarcane: "Sugarcane",
  millet: "Millet",
  dates: "Date palm",
};

export default async function FarmerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const locale = await getLocale();
  const en = locale === "en";
  const t = (ar: string, english: string) => tr(locale, ar, english);
  const arText = en ? ({ lang: "ar", dir: "rtl" } as const) : {};

  /*
   * The record is read with the service-role client, and the reason is the gap
   * between what this page shows and what its source returned.
   *
   * The page displays a score. `farmer_season_records` returns the numbers the
   * score is computed FROM — per-season planned budget, actual costs and
   * revenue. One season's revenue is that farmer's income for that season; it
   * is not an aggregate that protects anybody. And the function was
   * SECURITY DEFINER with EXECUTE to PUBLIC, so anyone holding the anon key —
   * which every browser on this site holds — could call it directly for any
   * owner id and read the money this page deliberately never prints.
   *
   * The intent was always right; the endpoint contradicted it. Reading it
   * server-side means the figures reach the scoring function and stop there.
   */
  const admin = createAdminClient();

  const [{ data: profileRows }, seasonResponse, { data: landRows }] =
    await Promise.all([
      supabase.rpc("public_farmer_profile", { p_id: id }),
      admin ? admin.rpc("farmer_season_records", { p_id: id }) : null,
      // بمفتاح الجلسة لا بمفتاح الخدمة، عمداً. والقراءةُ بدالّةٍ لا من الجدول
      // (البند ١٢٧): الجدولُ لم يعد يُقرأ لغير صاحبه، والدالّةُ تُرجع ما
      // يعرضه الجواز فقط — وتحترم إذنَ النشر نفسَه.
      supabase.rpc("public_farmer_lands", { p_owner: id }),
    ]);

  const profile = (
    profileRows as
      | {
          id: string;
          full_name: string;
          country: string | null;
          created_at: string;
        }[]
      | null
  )?.[0];

  if (!profile) notFound();

  /*
   * Unreadable is not the same as empty, and the page has to say which.
   *
   * With no service-role key configured, or with the call failing, an empty
   * list would render as "this person has recorded no seasons" — a statement
   * about them — and would feed computeTrust an empty record, which is a
   * judgement drawn from nothing. Both are worse than saying we could not read
   * it.
   */
  const recordUnavailable = seasonResponse === null || !!seasonResponse.error;
  if (seasonResponse?.error) {
    console.error("farmer_season_records: read failed", seasonResponse.error);
  }

  const seasons = (seasonResponse?.data ?? []) as SeasonRow[];

  const records: SeasonRecord[] = seasons.map((s) => ({
    status: s.status,
    feddans: Number(s.feddans),
    plannedBudget: Number(s.planned_budget),
    actualCosts: Number(s.actual_costs),
    revenue: Number(s.revenue),
    stagesTotal: s.stages_total,
    stagesCompleted: s.stages_completed,
    stagesWithEvidence: s.stages_with_evidence,
    stagesDated: s.stages_dated,
    stagesOnTime: s.stages_on_time,
  }));

  const lands = (landRows ?? []) as VerifiedLand[];

  const trust = computeTrust(records, locale);

  const bandTone =
    trust.band === "trusted"
      ? "text-primary"
      : trust.band === "established"
        ? "text-accent"
        : "text-muted";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold" {...arText}>{profile.full_name}</h1>
      <p className="mt-1 text-sm text-muted">
        {profile.country ? `${profile.country} · ` : ""}
        {t("منضمّ منذ", "Member since")}{" "}
        {new Date(profile.created_at).toLocaleDateString(en ? "en-GB" : "ar-EG")}
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <p className="text-xs text-muted">{t("مؤشر الثقة", "Trust score")}</p>
        {/*
          A score is a judgement, and a judgement drawn from a record we failed
          to read is a judgement drawn from nothing. When the record is
          unavailable the index says so and stops — it does not fall back to
          "no history", which reads as a verdict on the person.
        */}
        {recordUnavailable ? (
          <>
            <p className="mt-1 text-3xl font-black text-muted">—</p>
            <p className="mt-2 text-sm text-muted">
              {t(
                "لا يمكن حساب المؤشر قبل قراءة السجلّ. وغياب الرقم هنا لا يعني أن السجلّ خالٍ.",
                "The score cannot be calculated before the record is read. A missing number here does not mean the record is empty.",
              )}
            </p>
          </>
        ) : (
          <>
            {trust.score === null ? (
              <p className="mt-1 text-3xl font-black text-muted">—</p>
            ) : (
              <p className={`mt-1 text-4xl font-black ${bandTone}`}>
                {trust.score}
                <span className="text-lg text-muted">/100</span>
              </p>
            )}
            <p className={`text-sm font-medium ${bandTone}`}>
              {trust.bandLabel}
            </p>
            <p className="mt-2 text-sm text-muted">{trust.summary}</p>
          </>
        )}

        {!recordUnavailable && trust.factors.length > 0 && (
          <div className="mt-5 flex flex-col gap-3">
            {trust.factors.map((f) => (
              <div key={f.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{f.label}</span>
                  {/* «—» لا صفر: الصفرُ حكمٌ، والشرطةُ اعترافٌ بأنّ لا سجلَّ
                      يُحكم به. وشريطٌ فارغٌ يُقرأ صفراً، فلا شريطَ أصلاً. */}
                  <span className="text-xs text-muted">
                    {f.score === null
                      ? `${t("لا يُقاس", "Not measured")} · ${f.weight}`
                      : `${Math.round(f.score * f.weight)}/${f.weight}`}
                  </span>
                </div>
                {f.score !== null && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.round(f.score * 100)}%` }}
                    />
                  </div>
                )}
                <p className="mt-1 text-xs text-muted">{f.detail}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted">
          {t(
            "كل رقم أعلاه محسوب من مواسم سجّلها هذا المنفّذ ووثّق مراحلها بأدلة — لا من تقييم كتبه عن نفسه ولا من انطباعات. وتفاصيل مصروفاته تبقى خاصة به: ما يظهر هنا مجاميع فقط.",
            "Every figure above is calculated from seasons this operator recorded and backed with evidence at each stage — not from a self-assessment or impressions. Their spending details stay private: only totals are shown here.",
          )}
        </p>
      </div>

      {lands.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">
            {t("الأرض الموثّقة", "Verified land")} ({lands.length})
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-muted">
            {t(
              "راجع موظّفٌ مستنداتِ كلّ قطعةٍ هنا وأثبت أنّها لصاحب هذا السجل. وما لم يُوثَّق لا يظهر —",
              "A staff member reviewed the documents for each plot here and confirmed it belongs to the owner of this record. Anything not verified is not shown —",
            )}{" "}
            <strong>{t("لا لأنّه غيرُ موجود", "not because it doesn't exist")}</strong>
            {t(
              "، بل لأنّ المنصّة لا تشهد بما لم تفحصه.",
              ", but because the platform does not vouch for what it has not checked.",
            )}
          </p>
          <ul className="flex flex-col gap-3">
            {lands.map((l, i) => (
              <li key={l.id ?? `offered-${i}`} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium" {...arText}>
                    {l.offered ? t("أرضٌ معروضة للشراكة", "A plot offered for partnership") : l.name}
                  </span>
                  <span className="text-xs text-muted">
                    {(en ? TENURE_LABEL_EN : TENURE_LABEL)[l.tenure] ?? l.tenure}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  <span {...arText}>
                    {[l.state, l.locality].filter(Boolean).join(" · ") || "—"}
                  </span>
                  {l.feddans
                    ? ` · ${n0(Number(l.feddans))} ${t("فدان", "feddans")}`
                    : ""}
                </p>
                {l.verification_note && (
                  <p className="mt-1 text-xs text-muted" {...arText}>{l.verification_note}</p>
                )}
              </li>
            ))}
          </ul>
          {/* والإحداثيّةُ ليست هنا عمداً: الأرضُ المنشورة تحمل موقعَها في
              سجلّها، ونشرُ نقطةٍ دقيقةٍ على صفحةِ شخصٍ باسمه شيءٌ آخر لم يوافق
              عليه أحد. */}
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-bold">
          {t("المواسم", "Seasons")}{recordUnavailable ? "" : ` (${seasons.length})`}
        </h2>
        {recordUnavailable ? (
          <p className="rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm leading-relaxed">
            {t("تعذّر قراءة سجلّ المواسم الآن —", "We couldn't read the season record just now —")}{" "}
            <strong>{t("والخلل عندنا", "the fault is ours")}</strong>
            {t(
              "، فلا تقرأ هذا على أنه سجلّ فارغ. أعد المحاولة بعد قليل.",
              ", so don't read this as an empty record. Try again in a moment.",
            )}
          </p>
        ) : seasons.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            {t("لا توجد مواسم مسجّلة لهذا المنفّذ.", "This operator has no recorded seasons.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {seasons.map((s) => {
              const crop =
                (en ? CROP_EN[s.crop_key] : undefined) ??
                CROPS.find((c) => c.key === s.crop_key)?.name ??
                s.crop_key;
              return (
                <li
                  key={s.season_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5"
                >
                  <div>
                    <p className="font-medium" {...arText}>{s.name}</p>
                    <p className="text-sm text-muted">
                      {crop} · {n0(Number(s.feddans))} {t("فدان", "feddans")} ·{" "}
                      {t("زراعة", "planted")} {s.planting_date}
                    </p>
                  </div>
                  <div className="text-end text-sm">
                    <p className="text-muted">
                      {s.stages_completed}/{s.stages_total} {t("مراحل", "stages")}
                    </p>
                    <span
                      className={`text-xs font-medium ${
                        s.status === "completed"
                          ? "text-primary"
                          : s.status === "abandoned"
                            ? "text-danger"
                            : "text-accent"
                      }`}
                    >
                      {s.status === "completed"
                        ? t("مكتمل", "Completed")
                        : s.status === "abandoned"
                          ? t("متوقف", "Stopped")
                          : t("جارٍ", "In progress")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
