import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FilmPlayer from "@/components/FilmPlayer";
import KnowledgeCard from "@/components/KnowledgeCard";
import MineralsMap, { GROUPS, MINERALS, type MineralSite } from "@/components/MineralsMap";
import MapScreen from "@/components/map/MapScreen";
import { mapThemes } from "@/lib/mapLayers";
import { digits } from "@/components/RainMap";
import type { KnowledgeEntry } from "@/types/database";
import { COMMODITY_EN, SITE_STATUS_EN, SITE_WHAT_EN, inEnglish, placeName } from "@/lib/enNames";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "التعدين | سوداقري", "Mining | Sudagri"),
    description: tr(
      locale,
      "معرفة عملية للمعدّنين: السلامة، والاستخلاص بلا زئبق، وجيولوجيا الذهب في السودان.",
      "Practical knowledge for miners: safety, mercury-free extraction, and the geology of gold in Sudan.",
    ),
  };
}

export default async function MiningPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";

  const { data } = await supabase
    .from("knowledge_entries")
    .select("*")
    .eq("crop", "تعدين")
    .eq("assistant_only", false)
    .order("created_at", { ascending: false });

  const entries = (data ?? []) as KnowledgeEntry[];

  // Largest group first: oil and gold are what most readers came for.
  const groups = new Map<string, MineralSite[]>();
  for (const s of MINERALS.sites) groups.set(s.commodityAr, [...(groups.get(s.commodityAr) ?? []), s]);
  const byCommodity = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div>
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <div className="mb-3 text-4xl">⛏️</div>
          <h1 className="mx-auto max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
            {t("قسم التعدين", "Mining")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            {t(
              "قسم مستقل تماماً عن الزراعة. هدفه الآن واحد: معرفة تحمي حياة المعدّن — السلامة في الحفر، والاستخلاص بلا زئبق، وأين يوجد الذهب ولماذا.",
              "A section entirely separate from farming. For now it has one aim: knowledge that protects a miner's life — safety in the pit, extraction without mercury, and where gold is found and why.",
            )}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-danger/40 bg-danger/5 p-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-danger">
            <span aria-hidden>⚠️</span> {t("اقرأ هذا قبل أي شيء", "Read this before anything else")}
          </h2>
          <p className="text-sm leading-relaxed">
            {t(
              "حرق ملغم الزئبق في مكان مغلق أو قرب السكن يسمّم من فيه لا العامل وحده، والضرر العصبي منه لا يُشفى. والنزول لإنقاذ مصاب في حفرة بلا تهوية يقتل المُنقِذ أيضاً — أغلب حوادث الاختناق تأخذ اثنين لا واحداً. التفاصيل العملية في البطاقات أدناه، واسأل مساعد سوداقري عن أي منها.",
              "Burning mercury amalgam indoors or near homes poisons everyone there, not just the worker, and the nerve damage it causes does not heal. Going down to rescue someone in an unventilated pit kills the rescuer too — most suffocation accidents take two people, not one. The practical details are in the cards below; ask Sudagri's assistant about any of them.",
            )}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <FilmPlayer base="/video/mining-wide" poster="/video/mining-wide.jpg" label={t(
            "فيلم سوداقري: كنوزٌ تحت الأرض… بلا زئبق",
            "A Sudagri film: treasure under the ground… without mercury",
          )} />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-2 text-xl font-bold">{t("خريطة المعادن في السودان", "Map of minerals in Sudan")}</h2>
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted">
          {en
            ? `${MINERALS.sites.length} sites: mines, plants and oilfields as the US Geological Survey recorded them for ${MINERALS.asOf}, before the war, along with known deposits. It is a map of where the minerals are, not of who works them today.`
            : `${digits(MINERALS.sites.length, locale)} موقعاً: المناجم والمصانع وحقول النفط كما سجّلها المسح الجيولوجي الأمريكي لسنة ${digits(MINERALS.asOf, locale)}، قبل الحرب، ومعها الرواسب المعروفة. هي خريطة لمكان المعادن، لا لمن يعمل فيها اليوم.`}
        </p>
        <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-3">
            {/* The live map (البند ١٤٧): every site, tapped for what it is. */}
            <MapScreen
              themes={mapThemes(null, [], locale).filter((x) => x.key === "minerals")}
              initial="none"
              initialOver={["minerals"]}
              address={false}
              full="/map?layer=none&over=minerals"
              className="h-[65vh] min-h-80"
            />
            {/* The printed map stays, folded: it draws a site's kind as its shape. */}
            <details className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <summary className="cursor-pointer text-sm font-bold">
                {t("الخريطة المرسومة: نوع كلّ موقعٍ بشكل علامته", "The drawn map: each site's kind by the shape of its mark")}
              </summary>
              <div className="mt-3">
                <MineralsMap locale={locale} />
              </div>
            </details>
          </div>
          <div className="flex flex-col gap-2">
            {byCommodity.map(([commodity, sites]) => (
              <details key={commodity} className="rounded-xl border border-border bg-card px-4 py-3">
                <summary className="flex cursor-pointer items-center gap-2 font-bold">
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{ background: GROUPS[sites[0].group].ink }}
                    aria-hidden
                  />
                  {inEnglish(COMMODITY_EN, commodity, locale)}
                  <span className="text-sm font-normal text-muted">({digits(sites.length, locale)})</span>
                </summary>
                <ul className="mt-3 flex flex-col gap-3 text-sm">
                  {sites.map((s, k) => (
                    <li key={k} className="border-t border-border pt-2">
                      <p className="font-medium">
                        {en ? s.name : (s.place ?? <span dir="ltr">{s.name}</span>)}
                        {s.place && !en && (
                          <span className="ms-2 text-xs text-muted" dir="ltr">
                            {s.name}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {(en
                          ? [
                              inEnglish(SITE_WHAT_EN, s.what, locale),
                              s.also.length
                                ? `also: ${s.also.map((a) => inEnglish(COMMODITY_EN, a, locale)).join(", ")}`
                                : null,
                              s.state ? `${placeName(s.state, locale)} state` : null,
                              s.status ? inEnglish(SITE_STATUS_EN, s.status, locale) : null,
                            ]
                          : [
                              s.what,
                              s.also.length ? `ومعه: ${s.also.join("، ")}` : null,
                              s.state ? `ولاية ${s.state}` : null,
                              s.status,
                            ]
                        )
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {s.operator && (
                        <p className="text-xs text-muted" dir="ltr">
                          {s.operator}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {t(
                "المصدر: المسح الجيولوجي الأمريكي (USGS)، «بيانات جغرافية لصناعات التعدين والبنية المرتبطة بها في أفريقيا»، ٢٠٢١، ملكية عامة. الأسماء بالعربية حيث الاسم العربي مؤكّد، وإلا تُركت كما كتبها المصدر.",
                "Source: the US Geological Survey (USGS), \"Geospatial data for the mineral industries and related infrastructure of Africa\", 2021, public domain. Site names are as the source wrote them.",
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-6 text-xl font-bold">
          {t("معرفة التعدين", "Mining knowledge")} ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="text-muted">{t("قيد الإعداد.", "In preparation.")}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <KnowledgeCard key={entry.id} entry={entry} locale={locale} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-2xl border border-border bg-card p-6">
          <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {t("متاح الآن", "Available now")}
          </span>
          <h2 className="mb-3 text-lg font-bold">{t("سجلّ إثبات المنشأ", "Proof-of-origin registry")}</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            {t(
              "سجل يوثّق سلسلة الحيازة: موقع الاستخراج بإحداثياته، ومن استخرج، وبأي طريقة، وكيف انتقل. تسجيل معلومات فقط — لا بيع ولا وساطة ولا عمولة.",
              "A registry that documents the chain of custody: the extraction site with its coordinates, who extracted, by what method, and how it moved. Information only — no selling, no brokering, no commission.",
            )}
          </p>
          <div className="mb-4 rounded-xl bg-background p-4 text-sm leading-relaxed">
            <p className="mb-2 font-bold">{t("لماذا هذا وليس سوق تداول؟", "Why this and not a trading market?")}</p>
            {en ? (
              <p className="text-muted">
                On 13 July 2026 the European Union banned buying, importing and moving gold of Sudanese origin by
                anyone within it, and days later Britain sanctioned Sudanese gold networks. Any platform connecting a
                seller to an international buyer today would find no lawful buyer. But value in this sector has
                already moved from owning gold to{" "}
                <strong className="text-foreground">proving where it came from</strong>, and whoever builds that
                proof now will be ready with years of data when the channel reopens — not with an empty system.
              </p>
            ) : (
            <p className="text-muted">
              في ١٣ يوليو ٢٠٢٦ حظر الاتحاد الأوروبي شراء واستيراد ونقل الذهب
              سوداني المنشأ من أي جهة داخله، وبعده بأيام فرضت بريطانيا عقوبات
              على شبكات ذهب سودانية. أي منصة تربط بائعاً بمشترٍ دولي اليوم لن
              تجد مشترياً قانونياً. لكن القيمة في هذا القطاع انتقلت أصلاً من
              امتلاك الذهب إلى{" "}
              <strong className="text-foreground">إثبات مصدره</strong>، ومن يبني
              هذا الإثبات الآن يكون جاهزاً ببيانات سنوات حين تُفتح القناة — لا
              بنظام فارغ.
            </p>
            )}
          </div>
          <p className="mb-4 text-sm text-muted">
            {t(
              "الذهب المستخرج بلا زئبق له سوق مستعدّ يدفع أكثر — وهذا ما يوثّقه السجل أولاً.",
              "Gold extracted without mercury has a market ready to pay more — and that is what the registry documents first.",
            )}
          </p>
          <Link
            href="/mining/registry"
            className="inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("افتح سجلّ إثبات المنشأ", "Open the proof-of-origin registry")}
          </Link>
        </div>

        <Link
          href="/mining/gold"
          className="mt-4 flex flex-col gap-1 rounded-2xl border border-border bg-card p-5 transition hover:border-primary"
        >
          <span className="font-bold">{t("الذهب: أين يُباع رسمياً وبأيّ سعر ←", "Gold: where it is sold officially, and at what price →")}</span>
          <span className="text-sm text-muted">
            {t(
              "بنك السودان المركزي مشترياً، وقاعدة السعر اليومي (المنشور 13/2026)، وحظر الاتحاد الأوروبي — معلومات بمصادرها.",
              "The Central Bank of Sudan as buyer, the daily price rule (Circular 13/2026), and the EU ban — information with its sources.",
            )}
          </span>
        </Link>
      </section>
    </div>
  );
}
