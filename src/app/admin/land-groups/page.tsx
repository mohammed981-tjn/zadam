import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { stateName } from "@/lib/nafir";
import { cropName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import { soilAt } from "@/lib/rainMap";
import { num } from "@/lib/supplyChain";
import { AREA_BAND_LABEL, AREA_BAND_SHORT, areaBand, lbl, type AreaBand } from "@/lib/partners";
import { card } from "@/components/supply/SupplyShell";
import type { Land } from "@/types/database";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "فهرس مجموعات المزارع | سوداقري", "Farm groups index | Sudagri") };
}

/*
 * فهرسُ المزارع ومجموعاتها — البند ١١١ (docs/studies/services-company-ar.md، القسم ٥).
 *
 * Every verified land is placed in its group automatically, from what is
 * already on file: state, area band, soil class, water source and crops. No
 * one types a group.
 *
 * The soil class is the one stored when the owner opened the land to partners;
 * until then it is read here from the national soil map at the land's own
 * coordinates. So the index works on a database the partner migration has not
 * reached yet — `select("*")` returns whatever columns exist, and the new ones
 * are optional on Land.
 *
 * Inside each group is the supervisor's follow-up list — the «قروب» in the
 * study: each land, its locality and its owner's phone. Administrators only;
 * a company sees groups through partner_matching_lands(), never this page.
 */

type Row = Land & { soil: string | null; band: AreaBand | null };

export default async function LandGroupsPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const { data, error } = await supabase.from("lands").select("*").eq("verification", "verified").limit(5000);
  if (error) console.error("admin/land-groups: lands failed", error);
  const { count: waiting } = await supabase
    .from("lands")
    .select("id", { count: "exact", head: true })
    .in("verification", ["unverified", "submitted"]);

  const rows: Row[] = ((data ?? []) as Land[]).map((l) => ({
    ...l,
    soil: l.soil_class ?? soilAt(l.longitude, l.latitude),
    band: areaBand(l.feddans),
  }));

  const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
  const owners = new Map<string, { full_name: string; phone: string | null }>();
  if (ownerIds.length > 0) {
    const { data: p } = await supabase.from("profiles").select("id, full_name, phone").in("id", ownerIds);
    for (const o of (p ?? []) as { id: string; full_name: string; phone: string | null }[]) owners.set(o.id, o);
  }

  const soilName = (s: string | null) => (s ? (locale === "en" ? wrbShortEn(s) : wrbShort(s)) : t("تربة غير معروفة", "Soil unknown"));
  const bandName = (b: AreaBand | null) => (b ? lbl(AREA_BAND_SHORT[b], locale) : "—");
  const crops = (r: Row) => [...(r.crop_keys ?? [])].sort();
  const sep = locale === "en" ? ", " : "، ";

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = [r.state, r.water_source, r.soil ?? "", r.band ?? "", crops(r).join(",")].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const list = [...groups.values()]
    .map((g) => ({ g, feddans: g.reduce((s, r) => s + Number(r.feddans), 0) }))
    .sort((a, b) => b.feddans - a.feddans);

  const tally = (f: (r: Row) => string) => {
    const m = new Map<string, { n: number; feddans: number }>();
    for (const r of rows) {
      const k = f(r);
      const v = m.get(k) ?? { n: 0, feddans: 0 };
      m.set(k, { n: v.n + 1, feddans: v.feddans + Number(r.feddans) });
    }
    return [...m.entries()].sort((a, b) => b[1].feddans - a[1].feddans);
  };
  const dims: { title: string; rows: [string, { n: number; feddans: number }][] }[] = [
    { title: t("حسب الولاية", "By state"), rows: tally((r) => stateName(r.state, locale)) },
    { title: t("حسب المساحة", "By area"), rows: tally((r) => bandName(r.band)) },
    { title: t("حسب التربة", "By soil"), rows: tally((r) => soilName(r.soil)) },
    { title: t("حسب الماء", "By water"), rows: tally((r) => waterSourceLabel(r.water_source, locale)) },
  ];
  const openCount = rows.filter((r) => r.open_to_partners).length;
  const total = rows.reduce((s, r) => s + Number(r.feddans), 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href="/admin" className="text-primary underline">
          {t("→ لوحة الإدارة", "← Admin")}
        </Link>
        {" · "}
        <Link href="/admin/partners" className="text-primary underline">
          {t("الشركات الشريكة", "Partner companies")}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">{t("فهرس مجموعات المزارع", "Farm groups index")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {t(
          "كلّ أرضٍ موثّقة في مجموعتها آليّاً: الولاية، ومصدر الماء، وصنف التربة (من خريطة التربة بإحداثيّاتها، مربّعٌ عرضه نحو ١٦٠ كم)، وفئة المساحة، والمحاصيل التي اختارها صاحبها. وفي كلّ مجموعة قائمة متابعة بأصحاب الأراضي وهواتفهم، للمشرفين وحدهم.",
          "Every verified land in its group automatically: state, water source, soil class (from the soil map at its coordinates — a cell about 160 km across), area band, and the crops its owner chose. Each group holds a follow-up list of owners and phones, for administrators only.",
        )}
      </p>
      <p className="mt-2 text-xs text-muted">
        {t("فئات المساحة المقترحة (القرار للمالك): ", "Proposed area bands (the owner decides): ")}
        {(["small", "medium", "large"] as const).map((b) => lbl(AREA_BAND_LABEL[b], locale)).join(" · ")}
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("أراضٍ موثّقة", "Verified lands"), num(rows.length, locale, 0)],
          [t("فدان", "Feddans"), num(total, locale, 0)],
          [t("مجموعة", "Groups"), num(list.length, locale, 0)],
          [t("مفتوحة للشركاء", "Open to partners"), num(openCount, locale, 0)],
        ].map(([k, v]) => (
          <div key={k} className={card}>
            <p className="figure text-2xl font-black">{v}</p>
            <p className="text-xs text-muted">{k}</p>
          </div>
        ))}
      </section>
      {(waiting ?? 0) > 0 && (
        <p className="mt-3 text-sm">
          {t(`و${num(waiting ?? 0, locale, 0)} أرضاً تنتظر التوثيق، ولا تدخل الفهرس قبله. `, `And ${waiting} lands await verification; they join the index only after it. `)}
          <Link href="/admin/lands" className="text-primary underline">
            {t("توثيق الأراضي", "Land verification")}
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <p className={`${card} mt-6 text-sm text-muted`}>{t("لا أرض موثّقة بعد.", "No verified land yet.")}</p>
      ) : (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2">
            {dims.map((d) => (
              <div key={d.title} className={card}>
                <h2 className="font-bold">{d.title}</h2>
                <ul className="mt-2 text-sm">
                  {d.rows.map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-3 border-b border-border/50 py-1 last:border-0">
                      <span>{k}</span>
                      <span className="figure text-muted">
                        {num(v.n, locale, 0)} · {num(v.feddans, locale, 0)} {t("فدان", "fd")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-bold">{t("المجموعات", "Groups")}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {list.map(({ g, feddans }) => {
                const r = g[0];
                const c = crops(r);
                return (
                  <li key={r.id} className={card}>
                    <p className="font-bold">
                      {stateName(r.state, locale)} · {waterSourceLabel(r.water_source, locale)} · {soilName(r.soil)} · {bandName(r.band)}
                      {c.length > 0 && ` · ${c.map((k) => cropName(k, locale)).join(sep)}`}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {t(`${num(g.length, locale, 0)} أرض · ${num(feddans, locale, 0)} فدان`, `${g.length} lands · ${num(feddans, locale, 0)} feddans`)}
                      {" · "}
                      {t(`${num(g.filter((x) => x.open_to_partners).length, locale, 0)} مفتوحة للشركاء`, `${g.filter((x) => x.open_to_partners).length} open to partners`)}
                    </p>
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-primary">{t("قائمة المتابعة", "Follow-up list")}</summary>
                      <ul className="mt-2">
                        {g.map((x) => {
                          const o = owners.get(x.owner_id);
                          return (
                            <li key={x.id} className="flex flex-wrap justify-between gap-2 border-b border-border/50 py-1.5 last:border-0">
                              <span>
                                <bdi>{x.name}</bdi>
                                {x.locality && (
                                  <span className="text-muted">
                                    {" · "}
                                    <bdi>{x.locality}</bdi>
                                  </span>
                                )}
                                <span className="text-muted">
                                  {" · "}
                                  <span className="figure">{num(Number(x.feddans), locale, 1)}</span> {t("فدان", "fd")}
                                </span>
                              </span>
                              <span>
                                <bdi>{o?.full_name || "—"}</bdi>
                                {o?.phone && (
                                  <>
                                    {" · "}
                                    <a href={`tel:${o.phone}`} className="text-primary underline">
                                      <bdi className="figure">{o.phone}</bdi>
                                    </a>
                                  </>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
