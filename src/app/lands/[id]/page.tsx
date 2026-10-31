import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { cropName, irrigationLabel, stationName, waterSourceLabel } from "@/lib/farmLabelsEn";
import PageHeader from "@/components/PageHeader";
import LandTestForm from "@/components/LandTestForm";
import { card, ghost } from "@/lib/ui";
import { FAO29_TABLE1, cropsAtSoilSalinity, phNormal, waterSalinity, type LandTest } from "@/lib/landTests";
import type { Land, Season } from "@/types/database";
import { deleteLandTest } from "../actions";
import LandBoundaryMap from "@/components/map/LandBoundaryMap";
import { boundaryOf } from "@/lib/landInput";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "بطاقة الحقل | سوداقري", "Field card | Sudagri") };
}

const HOUR_MS = 3_600_000;

/**
 * «بطاقة الحقل» (البند ١٦٤، الغنيمة ٢ من كنوز): تاريخ الأرض موسماً موسماً، وفحوص مائها وتربتها بتواريخها
 * في مكانٍ واحد، فلا يضيع على المالك الغائب ولا على المدير الذي يخلفه.
 */
export default async function FieldCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const { data: landRow } = await supabase.from("lands").select("*").eq("id", id).maybeSingle();
  if (!landRow) notFound();
  const land = landRow as Land;

  const [{ data: seasonRows }, { data: testRows }] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, crop_key, irrigation, feddans, planting_date, harvest_date, status, harvest_kg")
      .eq("land_id", id)
      .order("planting_date", { ascending: false }),
    supabase.from("land_tests").select("*").eq("land_id", id).order("tested_on", { ascending: false }),
  ]);
  const seasons = (seasonRows ?? []) as Pick<
    Season,
    "id" | "name" | "crop_key" | "irrigation" | "feddans" | "planting_date" | "harvest_date" | "status" | "harvest_kg"
  >[];
  const tests = (testRows ?? []) as LandTest[];
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().getTime();
  const date = (d: string) => new Date(d).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium" });
  const latestSoil = tests.find((x) => x.kind === "soil" && x.ec_dsm !== null);
  const soilCrops = latestSoil?.ec_dsm != null ? cropsAtSoilSalinity(Number(latestSoil.ec_dsm)) : null;

  // The boundary drawn in the app (backlog 134), and the area it encloses beside the area on record.
  const drawn = land.boundary && land.boundary.length >= 3 ? land.boundary : null;
  const enclosed = drawn ? boundaryOf(drawn.map(([lat, lng]) => ({ lat, lng }))) : null;

  const statusText = { active: t("جارٍ", "Running"), completed: t("مُقفل", "Closed"), abandoned: t("متروك", "Abandoned") };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {land.owner_id === user.id ? (
        <Link href="/lands" className="text-sm text-primary underline">
          {t("← أراضيّ", "← My land")}
        </Link>
      ) : (
        // An agent the owner authorised (backlog 169), or the administrator: the land is not theirs, so say whose.
        <Link href={`/agent/${land.owner_id}`} className="text-sm text-primary underline">
          {t("← مزارعيّ: أرضٌ لمزارعٍ تعمل عنه", "← My farmers: a land of a farmer you act for")}
        </Link>
      )}
      <div className="mt-3">
        <PageHeader icon="wheat" eyebrow={t("بطاقة الحقل", "Field card")} title={land.name}>
          {t(
            "تاريخ هذه الأرض في مكانٍ واحد: مواسمها، وما فُحص من مائها وتربتها ومتى. ما تكتبه هنا لا يراه غيرك والإدارة، ووكيلك إن أذنت له في أراضيك.",
            "This land's history in one place: its seasons, and what was tested in its water and soil, and when. What you write here is seen only by you, the administration, and your agent if you authorised one for your land.",
          )}
        </PageHeader>
      </div>

      <section className={card}>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            [t("الولاية", "State"), land.state],
            [t("المساحة", "Area"), `${land.feddans} ${t("فدان", "feddans")}`],
            [t("المنطقة المناخية", "Climate zone"), stationName(land.station_key, locale)],
            [t("مصدر المياه", "Water source"), waterSourceLabel(land.water_source, locale)],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {drawn && (
          <div className="mt-4">
            <LandBoundaryMap boundary={drawn} label={land.name} />
            {enclosed && (
              <p className="mt-2 text-xs text-muted">
                {t(
                  `الحدود كما رُسمت في التطبيق (${drawn.length} ركناً) تحيط بـ ${enclosed.feddans.toFixed(2)} فدان.`,
                  `The boundary as drawn in the app (${drawn.length} corners) encloses ${enclosed.feddans.toFixed(2)} feddans.`,
                )}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="title-bar mb-3 font-black">{t("فحوص الماء والتربة", "Water and soil tests")}</h2>
        {tests.length === 0 ? (
          <p className="text-sm text-muted">
            {t(
              "لم يُسجَّل فحصٌ بعد. الفحص يكشف ملوحة الماء والتربة قبل أن يُزرع ما لا يحتملها.",
              "No test has been recorded yet. A test shows the salinity of the water and soil before something that cannot bear it is sown.",
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tests.map((x) => {
              const ec = x.ec_dsm === null ? null : Number(x.ec_dsm);
              const ph = x.ph === null ? null : Number(x.ph);
              const salinity = x.kind === "water" && ec !== null ? waterSalinity(ec) : null;
              const deletable = now - new Date(x.created_at).getTime() < HOUR_MS;
              return (
                <li key={x.id} className={card}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-black">
                      {x.kind === "water" ? t("ماء", "Water") : t("تربة", "Soil")} · {date(x.tested_on)}
                    </p>
                    {x.lab && (
                      <p className="text-xs text-muted" dir="auto">
                        {x.lab}
                      </p>
                    )}
                  </div>
                  <p className="mt-1 text-sm" dir="ltr">
                    {[
                      ec !== null && `EC ${ec} dS/m`,
                      ph !== null && `pH ${ph}`,
                      x.sar !== null && `SAR ${Number(x.sar)}`,
                      x.organic_matter_pct !== null && `OM ${Number(x.organic_matter_pct)}%`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(salinity || (x.kind === "water" && ph !== null)) && (
                    <p className="mt-1 text-xs text-muted">
                      {salinity === "none" && t("ملوحة الماء: بلا قيدٍ على الريّ (أقلّ من ٠٫٧).", "Water salinity: no restriction on irrigation (below 0.7).")}
                      {salinity === "moderate" && t("ملوحة الماء: قيدٌ خفيف إلى متوسّط (٠٫٧ إلى ٣٫٠).", "Water salinity: slight to moderate restriction (0.7 to 3.0).")}
                      {salinity === "severe" && t("ملوحة الماء: قيدٌ شديد (فوق ٣٫٠).", "Water salinity: severe restriction (above 3.0).")}
                      {salinity && ph !== null && " · "}
                      {x.kind === "water" && ph !== null &&
                        (phNormal(ph)
                          ? t("الحموضة في المدى الطبيعيّ (٦٫٥–٨٫٤).", "Acidity is in the normal range (6.5–8.4).")
                          : t("الحموضة خارج المدى الطبيعيّ (٦٫٥–٨٫٤).", "Acidity is outside the normal range (6.5–8.4)."))}
                    </p>
                  )}
                  {x.note && (
                    <p className="mt-1 text-xs text-muted" dir="auto">
                      {x.note}
                    </p>
                  )}
                  {deletable && (
                    <form action={deleteLandTest} className="mt-2">
                      <input type="hidden" name="land_id" value={land.id} />
                      <input type="hidden" name="test_id" value={x.id} />
                      <button className={ghost}>{t("احذفه (كُتب خطأً)", "Delete it (entered by mistake)")}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {soilCrops && latestSoil && (
          <div className={`${card} mt-3 text-sm`}>
            <p className="font-bold">
              {t(
                `ملوحة تربتك في آخر فحص (${date(latestSoil.tested_on)}): ${Number(latestSoil.ec_dsm)} dS/m`,
                `Your soil salinity at the last test (${date(latestSoil.tested_on)}): ${Number(latestSoil.ec_dsm)} dS/m`,
              )}
            </p>
            <p className="mt-1">
              {soilCrops.full.length > 0
                ? t(
                    `محاصيل تعطي حاصلها كاملاً عند هذه الملوحة، بحسب الفاو ٢٩: ${soilCrops.full.map((c) => cropName(c.key, locale)).join("، ")}.`,
                    `Crops that still give their full yield at this salinity, by FAO-29: ${soilCrops.full.map((c) => cropName(c.key, locale)).join(", ")}.`,
                  )
                : t("لا محصول في قائمتنا يعطي حاصله كاملاً عند هذه الملوحة بحسب الفاو ٢٩.", "No crop in our list gives its full yield at this salinity, by FAO-29.")}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t(
                `لا يُحسب هنا إلا ما له رقمٌ في الجدول ٤ من الفاو ٢٩ (${soilCrops.classOnly} محاصيل لها فئة تحمّلٍ فقط). `,
                `Only crops with a figure in FAO-29 Table 4 are counted (${soilCrops.classOnly} crops have only a tolerance class). `,
              )}
              <a href={FAO29_TABLE1} target="_blank" rel="noopener noreferrer" className="underline">
                FAO-29
              </a>
            </p>
          </div>
        )}

        {/* The owner's to write: an agent reads the card, and the tests stay the owner's (backlog 169). */}
        {land.owner_id === user.id && (
          <details className="mt-4 rounded-2xl border border-border bg-card p-4" open={tests.length === 0}>
            <summary className="cursor-pointer font-bold">{t("أضف فحصاً", "Add a test")}</summary>
            <LandTestForm landId={land.id} today={today} />
          </details>
        )}
      </section>

      <section className="mt-8">
        <h2 className="title-bar mb-3 font-black">{t("مواسم هذه الأرض", "This land's seasons")}</h2>
        {seasons.length === 0 ? (
          <p className="text-sm text-muted">
            {t("لا موسم مسجَّلٌ على هذه الأرض بعد.", "No season is recorded on this land yet.")}{" "}
            <Link href="/seasons/new" className="text-primary underline">
              {t("ابدأ موسماً", "Start a season")}
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {seasons.map((s) => (
              <li key={s.id} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/seasons/${s.id}`} className="font-black hover:text-primary" dir="auto">
                    {s.name}
                  </Link>
                  <span className="rounded-full bg-border/60 px-2.5 py-1 text-xs">{statusText[s.status]}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {cropName(s.crop_key, locale)} · {irrigationLabel(s.irrigation, locale)} · {s.feddans} {t("فدان", "feddans")} ·{" "}
                  {date(s.planting_date)}
                  {s.harvest_date ? ` → ${date(s.harvest_date)}` : ""}
                  {s.harvest_kg != null && ` · ${Math.round(Number(s.harvest_kg)).toLocaleString("en-US")} ${t("كجم", "kg")}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
