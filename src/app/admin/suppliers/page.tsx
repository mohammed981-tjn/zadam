import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { stateName } from "@/lib/nafir";
import {
  CATEGORY_LABEL,
  dateLabel,
  isNotDeployed,
  lbl,
  type Carrier,
  type ProductReport,
  type Supplier,
  type SupplierProduct,
} from "@/lib/supplyChain";
import { ComingSoon, card } from "@/components/supply/SupplyShell";
import { StatesList } from "@/components/supply/Explainers";
import { reviewCarrier, reviewReport, reviewSupplier, setSupplierActiveAdmin } from "./actions";
import { MEMBER_COLUMNS } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "مراجعة الموردين والناقلين | سوداقري", "Supplier and carrier review | Sudagri") };
}

/**
 * Where the «موثّق» badge is given: the administrator opens the licence photo
 * (a ten-minute signed link to the private bucket), checks the numbers against
 * it, and verifies or returns with a reason. Carriers and fraud reports are
 * reviewed here too.
 */
export default async function AdminSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const [{ data: sRows, error: sErr }, { data: pRows }, { data: cRows }, { data: rRows }, { data: noteRows }] = await Promise.all([
    supabase.from("suppliers").select(MEMBER_COLUMNS.suppliers).order("created_at"),
    supabase.from("supplier_products").select("id, supplier_id, category, name, registration_no, active"),
    supabase.from("carriers").select("*").order("created_at"),
    supabase.from("product_reports").select("*").order("created_at", { ascending: false }).limit(200),
    // The review note left the table's member columns (backlog 132); the administrators read it here.
    supabase.rpc("review_notes", { p_kind: "supplier" }),
  ]);
  const notDeployed = isNotDeployed(sErr);
  const notes = new Map(((noteRows ?? []) as { id: string; review_note: string }[]).map((r) => [r.id, r.review_note]));
  const suppliers = ((sRows ?? []) as unknown as Supplier[]).map((s) => ({ ...s, review_note: notes.get(s.id) ?? null }));
  const products = (pRows ?? []) as Pick<SupplierProduct, "id" | "supplier_id" | "category" | "name" | "registration_no" | "active">[];
  const carriers = (cRows ?? []) as Carrier[];
  const reports = (rRows ?? []) as ProductReport[];

  // Ten-minute links to the private evidence bucket — the storage policy lets an admin read it.
  const paths = [...suppliers.map((s) => s.licence_doc_path), ...reports.map((r) => r.photo_path)].filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabase.storage.from("evidence").createSignedUrls(paths, 600);
    for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }

  const pending = suppliers.filter((s) => !s.verified_at);
  const verified = suppliers.filter((s) => s.verified_at);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href="/admin" className="text-primary underline">
          {t("→ لوحة الإدارة", "← Admin")}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">{t("مراجعة الموردين والناقلين والبلاغات", "Suppliers, carriers and reports")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {t(
          "الشارة شهادةٌ على ما رأيته: افتح صورة المستندات، وطابق الأرقام المكتوبة بها. القاعدة نفسها ترفض توثيق تاجر مبيداتٍ بلا رخصة المجلس، وتاجر تقاوٍ بلا تسجيل الإدارة، وأيّ موردٍ بلا سجلٍّ تجاريٍّ أو صورة.",
          "The badge certifies what you saw: open the document photo and match the numbers written against it. The database itself refuses to verify a pesticide dealer without the Council licence, a seed dealer without the Seed Administration registration, and any supplier without a commercial registration or a photo.",
        )}
      </p>
      {sp.ok && <p className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{sp.ok}</p>}
      {sp.error && <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{sp.error}</p>}

      {notDeployed ? (
        <div className="mt-6">
          <ComingSoon what={t("لم تُطبَّق الهجرة 20261012130000_supply_chain.sql على قاعدة البيانات بعد.", "Migration 20261012130000_supply_chain.sql has not been applied to the database yet.")} />
        </div>
      ) : (
        <>
          <h2 className="mb-3 mt-8 text-lg font-bold">{t(`موردون بانتظار التوثيق (${pending.length})`, `Suppliers awaiting verification (${pending.length})`)}</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted">{t("لا شيء ينتظر.", "Nothing waiting.")}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {pending.map((s) => (
                <SupplierCard key={s.id} s={s} locale={locale} docUrl={s.licence_doc_path ? signed.get(s.licence_doc_path) : undefined} products={products.filter((p) => p.supplier_id === s.id)} />
              ))}
            </ul>
          )}

          <h2 className="mb-3 mt-10 text-lg font-bold">{t(`الموردون الموثّقون (${verified.length})`, `Verified suppliers (${verified.length})`)}</h2>
          <ul className="flex flex-col gap-4">
            {verified.map((s) => (
              <SupplierCard key={s.id} s={s} locale={locale} docUrl={s.licence_doc_path ? signed.get(s.licence_doc_path) : undefined} products={products.filter((p) => p.supplier_id === s.id)} />
            ))}
          </ul>

          <h2 className="mb-3 mt-10 text-lg font-bold">{t(`الناقلون (${carriers.length})`, `Carriers (${carriers.length})`)}</h2>
          <ul className="flex flex-col gap-3">
            {carriers.map((c) => (
              <li key={c.id} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{c.name}</span>
                  <span className={`text-sm ${c.verified_at ? "text-primary" : "text-accent"}`}>
                    {c.verified_at ? t(`موثّق — ${dateLabel(c.verified_at, locale)}`, `Verified — ${dateLabel(c.verified_at, locale)}`) : t("بانتظار المراجعة", "Awaiting review")}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  <bdi>{c.vehicle}</bdi> · {c.capacity_tonnes} {t("طن", "t")} · <bdi className="figure">{c.phone}</bdi> · <StatesList states={c.states} locale={locale} />
                </p>
                <ReviewForm action={reviewCarrier} idName="carrier_id" id={c.id} verified={Boolean(c.verified_at)} locale={locale} />
              </li>
            ))}
          </ul>

          <h2 id="reports" className="mb-3 mt-10 text-lg font-bold">
            {t(`بلاغات المنتجات المشبوهة (${reports.filter((r) => r.status === "new").length} جديد)`, `Suspicious product reports (${reports.filter((r) => r.status === "new").length} new)`)}
          </h2>
          <ul className="flex flex-col gap-3">
            {reports.map((r) => (
              <li key={r.id} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{r.product_name}</span>
                  <span className={`text-xs ${r.status === "new" ? "text-accent" : "text-muted"}`}>
                    {r.status === "new" ? t("جديد", "New") : r.status === "forwarded" ? t("أُحيل إلى المجلس", "Forwarded to the Council") : t("لا يستدعي إحالة", "Dismissed")}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {r.registration_no && (
                    <>
                      {t("رقم التسجيل:", "Reg.:")} <bdi className="figure">{r.registration_no}</bdi> ·{" "}
                    </>
                  )}
                  <bdi>{r.where_bought}</bdi> — {stateName(r.state, locale)} · {dateLabel(r.created_at, locale)}
                </p>
                {r.details && <p className="mt-1 text-sm">{r.details}</p>}
                {r.photo_path && signed.get(r.photo_path) && (
                  <a href={signed.get(r.photo_path)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-primary underline">
                    {t("افتح الصورة", "Open the photo")}
                  </a>
                )}
                {r.admin_note && <p className="mt-1 text-xs">{r.admin_note}</p>}
                <form action={reviewReport} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="report_id" value={r.id} />
                  <input name="note" maxLength={500} defaultValue={r.admin_note ?? ""} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" placeholder={t("ملاحظة: متى وكيف أُحيل", "Note: when and how it was forwarded")} />
                  <button name="status" value="forwarded" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                    {t("أُحيل إلى المجلس", "Forwarded to the Council")}
                  </button>
                  <button name="status" value="dismissed" className="rounded-lg border border-border px-3 py-1.5 text-xs">
                    {t("لا يستدعي", "Dismiss")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SupplierCard({
  s,
  locale,
  docUrl,
  products,
}: {
  s: Supplier;
  locale: Locale;
  docUrl?: string;
  products: Pick<SupplierProduct, "id" | "category" | "name" | "registration_no" | "active">[];
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <li className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold">{s.name}</span>
        <span className={`text-sm ${!s.active ? "text-danger" : s.verified_at ? "text-primary" : "text-accent"}`}>
          {!s.active ? t("موقوف", "Paused") : s.verified_at ? t(`موثّق — ${dateLabel(s.verified_at, locale)}`, `Verified — ${dateLabel(s.verified_at, locale)}`) : t("بانتظار التوثيق", "Awaiting verification")}
        </span>
      </div>
      <p className="text-xs text-muted">
        {stateName(s.state, locale)} — <bdi>{s.locality}</bdi> · <bdi className="figure">{s.phone}</bdi> · {s.categories.map((c) => lbl(CATEGORY_LABEL[c], locale)).join("، ")}
      </p>
      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">{t("السجلّ التجاري", "Commercial reg.")}</dt>
          <dd className="figure">{s.commercial_registration_no ?? <span className="text-danger">{t("ناقص", "missing")}</span>}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("رخصة المجلس", "Council licence")}</dt>
          <dd className="figure">
            {s.pesticide_licence_no ?? (s.categories.includes("pesticide") ? <span className="text-danger">{t("ناقصة — يبيع مبيدات", "missing — sells pesticides")}</span> : "—")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("تسجيل التقاوي", "Seed registration")}</dt>
          <dd className="figure">{s.seed_registration_no ?? (s.categories.includes("seed") ? <span className="text-danger">{t("ناقص — يبيع بذوراً", "missing — sells seed")}</span> : "—")}</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm">
        {docUrl ? (
          <a href={docUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
            {t("افتح صورة المستندات (رابطٌ لعشر دقائق)", "Open the document photo (ten-minute link)")}
          </a>
        ) : (
          <span className="text-danger">{t("لم تُرفع صورة المستندات.", "No document photo uploaded.")}</span>
        )}
      </p>
      {s.review_note && <p className="mt-1 text-xs">{t("آخر ملاحظة:", "Last note:")} {s.review_note}</p>}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer">{t(`المنتجات (${products.length})`, `Products (${products.length})`)}</summary>
        <ul className="mt-1 flex flex-col gap-0.5">
          {products.map((p) => (
            <li key={p.id} className={p.active ? "" : "line-through opacity-60"}>
              {lbl(CATEGORY_LABEL[p.category], locale)} · {p.name}
              {p.registration_no && <> · <bdi className="figure">{p.registration_no}</bdi></>}
            </li>
          ))}
        </ul>
      </details>
      <ReviewForm action={reviewSupplier} idName="supplier_id" id={s.id} verified={Boolean(s.verified_at)} locale={locale} />
      <form action={setSupplierActiveAdmin} className="mt-2">
        <input type="hidden" name="supplier_id" value={s.id} />
        <input type="hidden" name="active" value={s.active ? "false" : "true"} />
        <button className={`text-xs underline ${s.active ? "text-danger" : "text-primary"}`}>{s.active ? t("أوقفه مؤقّتاً", "Pause") : t("أعد تفعيله", "Reactivate")}</button>
      </form>
    </li>
  );
}

function ReviewForm({
  action,
  idName,
  id,
  verified,
  locale,
}: {
  action: (fd: FormData) => Promise<void>;
  idName: string;
  id: string;
  verified: boolean;
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <form action={action} className="mt-3 flex flex-wrap gap-2">
      <input type="hidden" name={idName} value={id} />
      <input name="note" maxLength={500} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" placeholder={verified ? t("سبب سحب التوثيق", "Reason for withdrawing") : t("ملاحظة — وإلزاميّةٌ عند الردّ", "Note — required when returning")} />
      {!verified && (
        <button name="verify" value="true" className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">
          {t("وثّق", "Verify")}
        </button>
      )}
      <button name="verify" value="false" className="rounded-lg border border-border px-4 py-1.5 text-sm">
        {verified ? t("اسحب التوثيق", "Withdraw") : t("ردّ بالسبب", "Return with reason")}
      </button>
    </form>
  );
}
