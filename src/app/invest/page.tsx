import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import InvestTabs from "@/components/invest/InvestTabs";
import ProjectCard from "@/components/ProjectCard";
import { cropName, stationName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import { AREA_BAND_SHORT, lbl, type AreaBand } from "@/lib/partners";
import {
  INTEREST_STATUS_LABEL,
  INVESTOR_MODEL_DETAIL,
  INVESTOR_MODEL_LABEL,
  INVESTOR_MODELS,
  type OpenLand,
} from "@/lib/investors";
import { button, card, field, ghost, label } from "@/lib/ui";
import { expressInvestorInterest } from "./actions";
import { requestInspection } from "./inspections/actions";
import {
  CHECK_DETAIL,
  CHECK_LABEL,
  INSPECTION_CHECKS,
  INSPECTION_STATUS_LABEL,
  feeLine,
  type InspectionRow,
  type InspectionStats,
} from "@/lib/inspections";
import type { Project } from "@/types/database";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "فرص الاستثمار | سوداقري", "Investment opportunities | Sudagri"),
    description: tr(
      locale,
      "أراضٍ زراعيّة وثّقتها سوداقري يبحث أصحابها عن شريك، ومشاريع مطروحة — مشاركة بالمحصول أو إيجار أو تمويل مدخلات.",
      "Farmland Sudagri has verified whose owners are looking for a partner, and projects on offer — crop sharing, lease or input finance.",
    ),
  };
}

/**
 * فرصُ الاستثمار (البند ١٢٤).
 *
 * The owner, 21 October: «اجعل لها صفحة خاصّة بالفرص والعروض للمستثمرين،
 * وكيف يستفيد المستثمر من صاحب الأرض بواسطة سوداقري».
 *
 * Investors had only `/projects`, which is empty until a farmer writes a full
 * opportunity with shares and a price. Most farmers will not; what they have
 * is verified land and no money for the season. So the page leads with those
 * lands, each with the partnership models its owner accepts, and with what the
 * platform does between the two — which is everything except hold the money.
 */
export default async function InvestPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "rtl" } as const) : {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: landRows, error: landError }, { data: projectRows }, { data: statRows }, { data: feeRow }, { data: myInspections }] =
    await Promise.all([
      supabase.rpc("investor_open_lands"),
      supabase.from("projects").select("*").neq("status", "draft").order("created_at", { ascending: false }).limit(6),
      supabase.rpc("land_inspection_stats"),
      supabase.from("platform_fees").select("amount_sdg").eq("key", "land_inspection").maybeSingle(),
      user ? supabase.rpc("land_inspection_list") : Promise.resolve({ data: null }),
    ]);
  if (landError) console.error("invest: open lands failed", landError);
  const lands = (landRows ?? []) as OpenLand[];
  const projects = (projectRows ?? []) as Project[];
  // Both read as "nothing yet" on a database the inspection migration has not reached.
  const stats = ((statRows ?? []) as InspectionStats[])[0] ?? null;
  const inspectionsOn = statRows !== null;
  const fee = (feeRow as { amount_sdg: number | null } | null)?.amount_sdg ?? null;
  const openInspection = new Map(
    ((myInspections ?? []) as InspectionRow[])
      .filter((i) => i.role === "investor" && ["requested", "accepted", "assigned", "reported"].includes(i.status))
      .map((i) => [i.land_id, i]),
  );

  const soil = (s: string | null) => (s ? (locale === "en" ? wrbShortEn(s) : wrbShort(s)) : "—");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader icon="chart" eyebrow={t("للمستثمرين", "For investors")} title={t("فرص الاستثمار", "Investment opportunities")}>
        {t(
          "أراضٍ وثّقت سوداقري مستنداتها يبحث أصحابها عن شريك، ومشاريع مطروحة. أنت تموّل، وصاحب الأرض يقدّم الأرض والماء والعمل، وسوداقري تتحقّق وتتابع. المال لا يمرّ بالمنصّة، ولا أحد يَعِدك بربح.",
          "Land whose documents Sudagri has verified, whose owners are looking for a partner, and projects on offer. You finance, the owner brings the land, the water and the work, and Sudagri verifies and follows up. The money does not pass through the platform, and no one promises you a profit.",
        )}
      </PageHeader>

      <InvestTabs active="/invest" locale={locale} />
      <ActionNotice ok={sp.ok} error={sp.error} />

      {/* ── ثلاث طرق للشراكة ───────────────────────────────────────────── */}
      <section aria-labelledby="models" className="mb-10">
        <h2 id="models" className="title-bar mb-4 text-lg font-black">
          {t("كيف يستفيد المستثمر من صاحب الأرض", "How an investor and a landowner work together")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {INVESTOR_MODELS.map((m) => (
            <article key={m} className={card}>
              <h3 className="font-black text-primary">{lbl(INVESTOR_MODEL_LABEL[m], locale)}</h3>
              <p className="mt-2 text-sm leading-6">
                <span className="font-bold">{t("المستثمر: ", "Investor: ")}</span>
                {lbl(INVESTOR_MODEL_DETAIL[m].investor, locale)}
              </p>
              <p className="mt-1 text-sm leading-6">
                <span className="font-bold">{t("صاحب الأرض: ", "Landowner: ")}</span>
                {lbl(INVESTOR_MODEL_DETAIL[m].owner, locale)}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs leading-6 text-muted">
          {t(
            "النسبة والأجرة والمدّة يتّفق عليها الطرفان كتابةً — سوداقري لا تحدّدها ولا تضمنها.",
            "The share, the rent and the term are agreed in writing between the two — Sudagri neither sets nor guarantees them.",
          )}
        </p>
      </section>

      {/* ── أراضٍ تبحث عن شريك ─────────────────────────────────────────── */}
      <section aria-labelledby="lands" className="mb-10">
        <h2 id="lands" className="title-bar mb-4 text-lg font-black">
          {t("أراضٍ تبحث عن شريك", "Land looking for a partner")} <span className="text-muted">({lands.length})</span>
        </h2>

        {landError ? (
          <p className={`${card} text-sm text-muted`}>
            {t("تعذّرت قراءة الأراضي الآن — والخلل عندنا. أعد المحاولة بعد قليل.", "We couldn't load the land just now — the fault is ours. Try again shortly.")}
          </p>
        ) : lands.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm leading-7 text-muted">
            <p className="font-bold text-foreground">{t("لا أرض معروضة بعد.", "No land on offer yet.")}</p>
            <p>
              {t(
                "تظهر هنا الأرض بعد أن توثّقها الإدارة ويفتحها صاحبها للمستثمرين من صفحة «أراضيّ».",
                "Land appears here once the administrators have verified it and its owner opens it to investors from «My land».",
              )}
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {lands.map((l) => {
              const band = l.area_band as AreaBand | null;
              return (
                <li key={l.land_id} className={`${card} flex flex-col`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-black" {...arText}>
                      {[l.state, l.locality].filter(Boolean).join(" · ")}
                    </h3>
                    <span className="rounded-full bg-leaf/10 px-2.5 py-0.5 text-xs font-bold text-leaf">
                      {t("أرض موثّقة", "Verified land")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    <bdi className="font-bold text-foreground">{Number(l.feddans).toLocaleString("en-US")}</bdi>{" "}
                    {t("فدان", "feddans")}
                    {band && AREA_BAND_SHORT[band] ? ` · ${lbl(AREA_BAND_SHORT[band], locale)}` : ""}
                  </p>

                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {l.models.map((m) => (
                      <li key={m} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                        {lbl(INVESTOR_MODEL_LABEL[m], locale)}
                      </li>
                    ))}
                  </ul>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">{t("مصدر المياه", "Water source")}</dt>
                      <dd className="font-medium">{waterSourceLabel(l.water_source, locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("المياه للفدان", "Water per feddan")}</dt>
                      <dd className="font-medium">
                        {l.water_per_feddan ? `${Math.round(Number(l.water_per_feddan)).toLocaleString("en-US")} ${t("م³", "m³")}` : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("التربة", "Soil")}</dt>
                      <dd className="font-medium">{soil(l.soil_class)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("المنطقة المناخيّة", "Climate zone")}</dt>
                      <dd className="font-medium">{stationName(l.station_key, locale)}</dd>
                    </div>
                    {l.crop_keys.length > 0 && (
                      <div className="col-span-2">
                        <dt className="text-xs text-muted">{t("المحاصيل التي يريدها", "Crops the owner wants")}</dt>
                        <dd className="font-medium">{l.crop_keys.map((c) => cropName(c, locale)).join(" · ")}</dd>
                      </div>
                    )}
                  </dl>

                  {l.note && (
                    <blockquote className="mt-3 rounded-xl bg-background px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]" {...arText}>
                      «{l.note}»
                    </blockquote>
                  )}

                  <div className="mt-auto pt-4">
                    {l.mine ? (
                      <p className="text-sm font-bold text-muted">{t("هذه أرضك.", "This is your land.")}</p>
                    ) : l.interest_status ? (
                      <Link href="/invest/mine" className={`${ghost} inline-block`}>
                        {lbl(INTEREST_STATUS_LABEL[l.interest_status], locale)}
                      </Link>
                    ) : !user ? (
                      <Link href="/login" className={`${button} inline-block`}>
                        {t("سجّل الدخول لتطلب الشراكة", "Sign in to request a partnership")}
                      </Link>
                    ) : (
                      <details className="group">
                        <summary className={`${button} inline-block cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                          {t("اطلب الشراكة", "Request a partnership")}
                        </summary>
                        <form action={expressInvestorInterest} className="mt-3 flex flex-col gap-3">
                          <input type="hidden" name="land_id" value={l.land_id} />
                          <fieldset className="flex flex-col gap-1.5 text-sm">
                            <legend className="mb-1 font-bold">{t("نموذج الشراكة", "Partnership model")}</legend>
                            {l.models.map((m, i) => (
                              <label key={m} className="flex items-center gap-2">
                                <input type="radio" name="model" value={m} defaultChecked={i === 0} className="size-4" />
                                {lbl(INVESTOR_MODEL_LABEL[m], locale)}
                              </label>
                            ))}
                          </fieldset>
                          <label className={label}>
                            {t("رسالتك لصاحب الأرض", "Your message to the owner")}
                            <textarea
                              name="message"
                              rows={3}
                              minLength={10}
                              maxLength={1000}
                              required
                              className={field}
                              placeholder={t("من أنت، وماذا تقترح، ومتى تريد البدء.", "Who you are, what you propose, and when you want to start.")}
                            />
                          </label>
                          <p className="text-xs leading-5 text-muted">
                            {t(
                              "يصل صاحبَ الأرض إشعار. اسمك يظهر له، وهاتفك وموقع الأرض لا يُكشفان إلا بعد قبوله.",
                              "The owner is notified. They see your name; your phone and the land's location are shared only once they accept.",
                            )}
                          </p>
                          <button className={`${button} self-start`}>{t("أرسل الطلب", "Send the request")}</button>
                        </form>
                      </details>
                    )}

                    {inspectionsOn && !l.mine && user && (
                      <div className="mt-3 border-t border-border pt-3">
                        {openInspection.has(l.land_id) ? (
                          <Link
                            href={`/invest/inspections/${openInspection.get(l.land_id)!.id}`}
                            className="text-sm font-bold text-leaf underline"
                          >
                            {t("معاينتك: ", "Your inspection: ")}
                            {lbl(INSPECTION_STATUS_LABEL[openInspection.get(l.land_id)!.status], locale)}
                          </Link>
                        ) : (
                          <details>
                            <summary className="cursor-pointer text-sm font-bold text-leaf underline">
                              {t("اطلب تقرير معاينةٍ مستقلّ قبل أن تقرّر", "Ask for an independent inspection before you decide")}
                            </summary>
                            <form action={requestInspection} className="mt-3 flex flex-col gap-3 text-sm">
                              <input type="hidden" name="land_id" value={l.land_id} />
                              <fieldset className="flex flex-col gap-1.5">
                                <legend className="mb-1 font-bold">{t("ما الذي يتحقّق منه المفتّش؟", "What should the inspector check?")}</legend>
                                {INSPECTION_CHECKS.map((c) => (
                                  <label key={c} className="flex items-start gap-2">
                                    <input type="checkbox" name="checks" value={c} defaultChecked className="mt-1 size-4" />
                                    <span>
                                      <span className="font-bold">{lbl(CHECK_LABEL[c], locale)}</span>
                                      <span className="block text-xs text-muted">{lbl(CHECK_DETAIL[c], locale)}</span>
                                    </span>
                                  </label>
                                ))}
                              </fieldset>
                              <label className={label}>
                                {t("ما يهمّك أكثر (اختياري)", "What matters most to you (optional)")}
                                <textarea name="note" rows={2} maxLength={1000} className={field} />
                              </label>
                              <p className="text-xs leading-5 text-muted">
                                {feeLine(fee, locale)}{" "}
                                {t(
                                  "يزور الأرضَ مفتّشٌ تعيّنه سوداقري بعد موافقة صاحبها، وليس طرفاً في شيء. ولا تعرف اسم صاحب الأرض ولا موقعها من التقرير.",
                                  "An inspector appointed by Sudagri visits the land once its owner agrees, and is party to nothing. The report does not tell you the owner's name or where the land is.",
                                )}
                              </p>
                              <button className={`${ghost} self-start`}>{t("اطلب المعاينة", "Request the inspection")}</button>
                            </form>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── مشاريع مطروحة ──────────────────────────────────────────────── */}
      <section aria-labelledby="projects" className="mb-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="projects" className="title-bar text-lg font-black">
            {t("مشاريع مطروحة", "Projects on offer")} <span className="text-muted">({projects.length})</span>
          </h2>
          <Link href="/projects" className="text-sm font-bold text-primary underline">
            {t("كلّ المشاريع", "All projects")}
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
            {t(
              "لا مشروع مطروح بعد. المشروع فرصةٌ كتبها صاحبها بالمحصول والحصص، وراجعتها الإدارة قبل نشرها.",
              "No project on offer yet. A project is an opportunity its owner wrote out with a crop and shares, reviewed by the administrators before publication.",
            )}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} locale={locale} />
            ))}
          </div>
        )}
      </section>

      {/* ── خطوات الشراكة، وما تقدّمه سوداقري ─────────────────────────── */}
      <section aria-labelledby="steps" className="mb-10 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 id="steps" className="title-bar mb-4 text-lg font-black">{t("خطوات الشراكة", "The steps")}</h2>
          <ol className="flex flex-col gap-3">
            {[
              t("تتصفّح الأراضي: الولاية والمساحة والتربة والماء، بلا اسمٍ ولا موقع.", "Browse the land: state, area, soil and water — no name, no location."),
              t("ترسل طلب شراكة بالنموذج الذي يقبله صاحب الأرض، فيصله إشعار.", "Send a request in a model the owner accepts; they are notified."),
              t("يقبل صاحب الأرض، فيرى كلٌّ منكما اسم الآخر وهاتفه، وترى موقع الأرض.", "The owner accepts; each of you sees the other's name and phone, and you see where the land is."),
              t(
                "تعاين الأرض بنفسك، أو تطلب تقرير معاينةٍ مستقلّاً من سوداقري، وتقرأ دراسة جدواها: الماء والتكلفة والمخاطر.",
                "Inspect the land yourself, or ask Sudagri for an independent inspection report, and read its feasibility study: water, cost and risk.",
              ),
              t("تتّفقان كتابةً على النسبة أو الأجرة والمدّة، ثمّ تدفع مباشرةً مرحلةً بمرحلة بعد دليلها.", "Agree the share or rent and the term in writing, then pay directly, stage by stage, after each stage's evidence."),
            ].map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                  {(i + 1).toLocaleString(locale === "en" ? "en-US" : "ar-EG")}
                </span>
                <span className="pt-0.5 text-sm leading-6">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="title-bar mb-4 text-lg font-black">{t("ما تقدّمه سوداقري بين الطرفين", "What Sudagri does between the two")}</h2>
          <ul className="flex flex-col gap-2 text-sm leading-6">
            {[
              [t("أرضٌ موثّقة", "Verified land"), t("راجعت الإدارة مستنداتها قبل أن تُعرض.", "The administrators checked its documents before it was shown."), "/how-we-work"],
              [t("خصوصيّةٌ حتى القبول", "Privacy until acceptance"), t("لا اسمَ ولا هاتفَ ولا موقعَ قبل موافقة صاحب الأرض.", "No name, phone or location before the owner agrees."), null],
              [t("دراسة جدوى للأرض", "A feasibility study"), t("الماء والتكلفة والمخاطر بالأرقام قبل أن تقرّر.", "Water, cost and risk in figures before you decide."), "/tools/feasibility"],
              [
                t("تقرير معاينةٍ مستقلّ", "An independent inspection"),
                `${t("مفتّشٌ ليس طرفاً يزور الأرض ويكتب تقريراً بصوره.", "An inspector who is party to nothing visits the land and writes a report with photos.")} ${feeLine(fee, locale)}${
                  stats && stats.reported > 0
                    ? t(
                        ` كُتب ${stats.reported} تقريراً: ${stats.clear} سليمة، و${stats.conditional} بشروط، و${stats.not_recommended} لا يُنصح بها.`,
                        ` ${stats.reported} written: ${stats.clear} sound, ${stats.conditional} with conditions, ${stats.not_recommended} not recommended.`,
                      )
                    : ""
                }`,
                null,
              ],
              [t("شركات للإشراف والعمل", "Companies for supervision and work"), t("حرثٌ وريّ وحصاد وإشراف من شركاتٍ موثّقة.", "Ploughing, irrigation, harvest and supervision from verified companies."), "/partners"],
              [t("السوق والصادر", "The market and export"), t("أسعار المحاصيل اليوم، وملفّ الصادر للمشترين.", "Today's crop prices, and the export file for buyers."), "/market"],
              [t("المال لا يمرّ بنا", "The money does not pass through us"), t("تدفع مباشرةً، مرحلةً بمرحلة، بعد دليل المرحلة.", "You pay directly, stage by stage, after each stage's evidence."), null],
            ].map(([h, d, href]) => (
              <li key={String(h)} className="rounded-xl bg-card px-4 py-3 ring-1 ring-border">
                <span className="font-bold text-primary">{h}</span> — {d}{" "}
                {href && (
                  <Link href={String(href)} className="text-xs font-bold text-leaf underline">
                    {t("المزيد", "More")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── لصاحب الأرض ────────────────────────────────────────────────── */}
      <section className="hero-band rounded-3xl px-5 py-6 text-white">
        <h2 className="text-lg font-black">{t("عندك أرض وتبحث عن ممّول؟", "Have land and looking for finance?")}</h2>
        <p className="mt-1 text-sm leading-6 text-white/90">
          {t(
            "سجّلها مجّاناً وارفع مستنداتها. بعد أن توثّقها الإدارة، افتحها للمستثمرين من «أراضيّ» واختر نماذج الشراكة التي تقبلها.",
            "Register it for free and upload its documents. Once the administrators verify it, open it to investors from «My land» and choose the partnership models you accept.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={user ? "/lands" : "/signup"} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-[#ca2c72]">
            {user ? t("أراضيّ", "My land") : t("سجّل مجّاناً", "Sign up free")}
          </Link>
          <Link href="/lands/new" className="rounded-xl px-4 py-2 text-sm font-bold text-white ring-1 ring-white/60">
            {t("سجّل أرضاً", "Register land")}
          </Link>
        </div>
      </section>
    </div>
  );
}
