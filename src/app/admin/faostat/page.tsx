import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import { SLICES, type Domain } from "@/lib/faostatSync";
import { button, card, ghost } from "@/lib/ui";
import { applyFaostat, discardFaostat, syncFaostatNow } from "./actions";

export const metadata = { title: "بيانات الفاو | الإدارة | سوداقري" };
// «افحص الآن» compares three files with the table and may stage tens of thousands of rows.
export const maxDuration = 60;

interface PendingRow {
  domain: Domain;
  area: string;
  element: string;
  item: string;
  year: number;
  unit: string;
  value: number;
  flag: string | null;
  old_unit: string | null;
  old_value: number | null;
}

interface SyncRow {
  id: string;
  ran_at: string;
  trigger: "cron" | "admin";
  new_rows: number;
  changed_rows: number;
  same_rows: number;
  problems: string[];
}

interface LoadRow {
  id: string;
  applied_at: string;
  new_rows: number;
  changed_rows: number;
}

/**
 * بيانات الفاو — شاشة الإدارة (البند ١٩٧).
 *
 * The platform compares the FAOSTAT files committed in data/ with the table the pages read from, and holds only the
 * difference here. Nothing a visitor sees changes until the administrator approves it.
 */
export default async function AdminFaostatPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const n = (v: number | null) => (v === null ? "—" : Number(v).toLocaleString("en-US"));
  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Khartoum" })
      : "—";

  const count = async (domain: Domain, fresh: boolean) => {
    const q = supabase.from("faostat_pending").select("*", { count: "exact", head: true }).eq("domain", domain);
    const { count: c } = await (fresh ? q.is("old_value", null) : q.not("old_value", "is", null));
    return c ?? 0;
  };
  const [counts, changedSample, newSample, { data: syncRows, error }, { data: loadRows }] = await Promise.all([
    Promise.all(SLICES.map(async (s) => ({ ...s, fresh: await count(s.domain, true), changed: await count(s.domain, false) }))),
    supabase.from("faostat_pending").select("*").not("old_value", "is", null).order("domain").order("item").limit(40),
    supabase.from("faostat_pending").select("*").is("old_value", null).order("domain").order("item").limit(12),
    supabase.from("faostat_syncs").select("*").order("ran_at", { ascending: false }).limit(6),
    supabase.from("faostat_loads").select("*").order("applied_at", { ascending: false }).limit(6),
  ]);
  const changed = (changedSample.data ?? []) as PendingRow[];
  const fresh = (newSample.data ?? []) as PendingRow[];
  const syncs = (syncRows ?? []) as SyncRow[];
  const loads = (loadRows ?? []) as LoadRow[];
  const totalNew = counts.reduce((a, c) => a + c.fresh, 0);
  const totalChanged = counts.reduce((a, c) => a + c.changed, 0);
  const waiting = totalNew + totalChanged;

  const row = (p: PendingRow) => (
    <li key={`${p.domain}|${p.area}|${p.element}|${p.item}|${p.year}`} className="rounded-xl bg-background px-3 py-2 text-sm" dir="ltr">
      <span className="font-bold">{p.item}</span> · {p.area} · {p.element} · {p.year}
      <span className="block text-xs">
        {p.old_value !== null && (
          <>
            <span className="text-muted">
              {n(p.old_value)} {p.old_unit}
            </span>
            {" → "}
          </>
        )}
        <span className="font-bold text-primary">
          {n(p.value)} {p.unit}
        </span>
        {p.flag && <span className="text-muted"> · {p.flag}</span>}
        {p.old_unit !== null && p.old_unit !== p.unit && (
          <span className="ms-2 font-bold text-accent">{t("تغيّرت الوحدة", "unit changed")}</span>
        )}
      </span>
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader icon="shield" eyebrow={t("الإدارة", "Administration")} title={t("بيانات الفاو", "FAOSTAT data")}>
        {t(
          "غلّة المحاصيل وأسعار المنتجين والتجارة من منظمة الأغذية والزراعة. تجلبها المنصّة مرّتين في السنة وتقارنها كلّ يوم بما في القاعدة، وتحجز الفرق وحده هنا: لا يتغيّر ما يراه الزائر قبل أن تعتمده بنقرة. وما يُستبدل من أرقامٍ قديمة يُحفظ ولا يُمحى.",
          "Crop yields, producer prices and trade from the FAO. The platform fetches them twice a year and compares them every day with what the database holds, and holds only the difference here: nothing a visitor sees changes until you approve it in one click. Every old figure it replaces is kept, never erased.",
        )}
      </PageHeader>
      <ActionNotice ok={sp.ok} error={sp.error} />

      {error && (
        <p className={`${card} mb-6 text-sm text-muted`}>
          {t("تعمل هذه الشاشة بعد تطبيق هجرتها.", "This screen works once its migration is applied.")}
        </p>
      )}

      <section className="mb-8">
        <h2 className="title-bar mb-3 font-black">
          {t("ينتظر اعتمادك", "Waiting for your approval")} <span className="text-muted">({n(waiting)})</span>
        </h2>
        <ul className="mb-4 flex flex-col gap-2 text-sm">
          {counts.map((c) => (
            <li key={c.domain} className={`${card} flex flex-wrap items-center justify-between gap-2`}>
              <span className="font-bold">
                {c.name} <span className="text-xs text-muted" dir="ltr">({c.domain})</span>
              </span>
              <span className={c.fresh + c.changed > 0 ? "font-bold text-primary" : "text-muted"}>
                {t(`${n(c.fresh)} جديداً · ${n(c.changed)} معدَّلاً`, `${n(c.fresh)} new · ${n(c.changed)} changed`)}
              </span>
            </li>
          ))}
        </ul>
        {waiting > 0 ? (
          <div className="flex flex-wrap items-start gap-3">
            <form action={applyFaostat}>
              <button className={button}>{t(`اعتمد التحميل (${n(waiting)})`, `Approve the load (${n(waiting)})`)}</button>
            </form>
            <form action={discardFaostat}>
              <button className={ghost}>{t("اتركه جانباً", "Set it aside")}</button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted">{t("لا فرق بين الملفّات والقاعدة.", "No difference between the files and the database.")}</p>
        )}

        {changed.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-black">
              {t("أرقامٌ معدَّلة", "Changed figures")}{" "}
              <span className="font-normal text-muted">
                {totalChanged > changed.length ? t(`(أوّل ${changed.length} من ${n(totalChanged)})`, `(first ${changed.length} of ${n(totalChanged)})`) : ""}
              </span>
            </h3>
            <ul className="flex flex-col gap-1">{changed.map(row)}</ul>
          </>
        )}
        {fresh.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-black">
              {t("أرقامٌ جديدة (عيّنة)", "New figures (a sample)")}{" "}
              <span className="font-normal text-muted">{t(`(${fresh.length} من ${n(totalNew)})`, `(${fresh.length} of ${n(totalNew)})`)}</span>
            </h3>
            <ul className="flex flex-col gap-1">{fresh.map(row)}</ul>
          </>
        )}
      </section>

      <form action={syncFaostatNow} className="mb-8">
        <button className={button}>{t("افحص الآن", "Check now")}</button>
        <span className="ms-3 text-xs text-muted">
          {t("ويعمل وحده كلّ يوم، ولا يقارن من جديد إلا إن تغيّر ملفّ.", "It also runs by itself every day, and compares again only when a file has changed.")}
        </span>
      </form>

      <section className="mb-8">
        <h2 className="title-bar mb-3 font-black">{t("آخر الفحوص", "Recent checks")}</h2>
        {syncs.length === 0 ? (
          <p className="text-sm text-muted">{t("لم يُفحص بعد.", "Not checked yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {syncs.map((r) => (
              <li key={r.id} className="rounded-xl bg-background px-3 py-2">
                <span className="font-bold">{when(r.ran_at)}</span>{" "}
                <span className="text-muted">· {r.trigger === "cron" ? t("تلقائيّ", "automatic") : t("بضغطة", "by hand")}</span>
                <span className="block text-xs">
                  {t(
                    `${n(r.new_rows)} جديداً · ${n(r.changed_rows)} معدَّلاً · ${n(r.same_rows)} كما هو`,
                    `${n(r.new_rows)} new · ${n(r.changed_rows)} changed · ${n(r.same_rows)} unchanged`,
                  )}
                </span>
                {r.problems.length > 0 && (
                  <span className="block text-xs text-accent">{r.problems.join(" · ")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="title-bar mb-3 font-black">{t("التحميلات المعتمدة", "Approved loads")}</h2>
        {loads.length === 0 ? (
          <p className="text-sm text-muted">{t("لم يُعتمد تحميلٌ بعد.", "No load approved yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {loads.map((l) => (
              <li key={l.id}>
                <span className="font-bold">{when(l.applied_at)}</span> ·{" "}
                {t(`${n(l.new_rows)} جديداً و${n(l.changed_rows)} معدَّلاً`, `${n(l.new_rows)} new and ${n(l.changed_rows)} changed`)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
