import Link from "next/link";
import { currentFx } from "@/lib/livePrices";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { SUDAN_STATES, stateName } from "@/lib/nafir";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  INPUT_KEYS,
  INPUT_LABEL,
  dateLabel,
  isNotDeployed,
  lbl,
  matchesItem,
  num,
  resolveItem,
  resolveState,
  type Supplier,
  type SupplierProduct,
} from "@/lib/supplyChain";
import SupplyShell, { ComingSoon, button, card, field } from "@/components/supply/SupplyShell";
import ProductRow from "@/components/supply/ProductRow";
import {
  ContactButtons,
  CouncilWarning,
  LicenceRequirements,
  OffersNotReference,
  StatesList,
  VerifiedBadge,
} from "@/components/supply/Explainers";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الموردون الموثّقون | سوداقري", "Verified input suppliers | Sudagri"),
    description: tr(
      locale,
      "من أين تشتري السماد والبذور والمبيدات بثقة: موردون رأينا رخصهم، وأرقام تسجيل منتجاتهم، وأسعارهم بالدولار وبالجنيه اليوم.",
      "Where to buy fertiliser, seed and pesticides with confidence: suppliers whose licences we have seen, their products’ registration numbers, and their prices in dollars and in pounds today.",
    ),
  };
}

/**
 * دليلُ الموردين الموثّقين. The feasibility study links here as
 * /suppliers?item=urea&state=الجزيرة — `item` an input key or a category,
 * `state` the stored Arabic name (an English name also works).
 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; state?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const item = resolveItem(sp.item);
  const state = resolveState(sp.state);
  const fx = (await currentFx());
  const rate = fx?.bank.sell ?? null;

  const supabase = await createClient();
  const { data: sRows, error: sErr } = await supabase
    .from("suppliers")
    .select("*")
    .not("verified_at", "is", null)
    .eq("active", true)
    .order("name")
    .limit(500);
  const notDeployed = isNotDeployed(sErr);
  if (sErr && !notDeployed) console.error("suppliers: list failed", sErr);

  const suppliers = (sRows ?? []) as Supplier[];
  let products: SupplierProduct[] = [];
  if (suppliers.length > 0) {
    const { data: pRows, error: pErr } = await supabase
      .from("supplier_products")
      .select("*")
      .eq("active", true)
      .in(
        "supplier_id",
        suppliers.map((s) => s.id),
      )
      .order("price_usd");
    if (pErr) console.error("suppliers: products failed", pErr);
    products = (pRows ?? []) as SupplierProduct[];
  }

  const filtering = Boolean(item.key || item.category);
  const shown = suppliers
    .filter((s) => !state || s.state === state || s.delivery_states.includes(state))
    .map((s) => ({ s, items: products.filter((p) => p.supplier_id === s.id && matchesItem(p, item)) }))
    .filter(({ items }) => !filtering || items.length > 0);

  const itemLabel = item.key ? lbl(INPUT_LABEL[item.key], locale) : item.category ? lbl(CATEGORY_LABEL[item.category], locale) : null;

  return (
    <SupplyShell active="/suppliers" ok={sp.ok} error={sp.error}>
      <h1 className="text-2xl font-black">{t("من أين أشتري؟ — الموردون الموثّقون", "Where do I buy? — Verified suppliers")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "واردات السماد هبطت من نحو ٤٥٠ ألف طن في السنة إلى نحو ٥٠ ألفاً في 2024، وتضاعفت الأسعار، وانتشرت المبيدات المغشوشة. هنا موردون رأينا رخصهم بأعيننا، وكلُّ منتجٍ برقم تسجيله، وسعره بالدولار وبالجنيه اليوم.",
          "Fertiliser imports fell from about 450,000 tonnes a year to about 50,000 in 2024, prices doubled, and counterfeit pesticides spread. Here are suppliers whose licences we have seen ourselves, every product with its registration number, and its price in dollars and in pounds today.",
        )}
      </p>

      <div className="mt-5">
        <CouncilWarning locale={locale} />
      </div>

      <form method="get" className={`${card} mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end`}>
        <label className="flex flex-col gap-1 text-sm">
          {t("ماذا تريد؟", "What do you need?")}
          <select name="item" defaultValue={item.key ?? item.category ?? ""} className={field}>
            <option value="">{t("كلّ المدخلات", "All inputs")}</option>
            <optgroup label={t("الأصناف", "Categories")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {lbl(CATEGORY_LABEL[c], locale)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("المدخلات", "Inputs")}>
              {INPUT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {lbl(INPUT_LABEL[k], locale)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("ولايتك", "Your state")}
          <select name="state" defaultValue={state ?? ""} className={field}>
            <option value="">{t("كلّ الولايات", "All states")}</option>
            {SUDAN_STATES.map((s) => (
              <option key={s} value={s}>
                {stateName(s, locale)}
              </option>
            ))}
          </select>
        </label>
        <button className={button}>{t("اعرض", "Show")}</button>
      </form>

      {rate && fx && (
        <p className="mt-3 text-xs text-muted">
          {t(
            `الجنيه بسعر بيع ${fx.bank.name_ar} للدولار: ${num(rate, locale, 2)} جنيه، في ${dateLabel(fx.bank.date, locale)}.`,
            `Pounds at ${fx.bank.name_en}’s dollar selling rate: SDG ${num(rate, locale, 2)}, on ${dateLabel(fx.bank.date, locale)}.`,
          )}
        </p>
      )}

      <section className="mt-6" aria-live="polite">
        {notDeployed ? (
          <ComingSoon
            what={t(
              "دليل الموردين بُني وينتظر تفعيل قاعدة بياناته. يستطيع الموردون التسجيل فور تفعيلها، وكلُّ ما تحت هذا يشرح ما يلزمهم.",
              "The supplier directory is built and waiting for its database to be switched on. Suppliers can register as soon as it is; everything below explains what they need.",
            )}
          />
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
            <p className="font-bold">
              {filtering || state
                ? t(
                    `لا مورد موثّقاً${itemLabel ? ` يعرض ${itemLabel}` : ""}${state ? ` في ${state}` : ""} بعد.`,
                    `No verified supplier${itemLabel ? ` offering ${itemLabel}` : ""}${state ? ` in ${stateName(state, "en")}` : ""} yet.`,
                  )
                : t("لا مورد موثّقاً بعد.", "No verified supplier yet.")}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              {t(
                "إن كنت تعرف تاجراً مرخّصاً في منطقتك فدُلّه على هذه الصفحة. ويمكن لجمعيتك أن تجمع طلبات الأعضاء في طلبٍ جماعيٍّ واحد.",
                "If you know a licensed dealer near you, point them to this page. Your cooperative can also gather members’ needs into one group order.",
              )}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/suppliers/mine" className={button}>
                {t("سجّل مورداً", "Register as a supplier")}
              </Link>
              {(filtering || state) && (
                <Link href="/suppliers" className="rounded-xl border border-border px-4 py-2.5 text-sm">
                  {t("أزل التصفية", "Clear filters")}
                </Link>
              )}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {shown.map(({ s, items }) => (
              <li key={s.id} className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/suppliers/${s.id}`} className="text-lg font-bold hover:text-primary" {...(locale === "en" ? { lang: "ar", dir: "auto" } : {})}>
                    {s.name}
                  </Link>
                  <VerifiedBadge locale={locale} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {stateName(s.state, locale)} — <bdi>{s.locality}</bdi>
                  {s.delivery_states.length > 0 && (
                    <>
                      {" · "}
                      {t("يوصل إلى:", "Delivers to:")} <StatesList states={s.delivery_states} locale={locale} />
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {s.pesticide_licence_no && (
                    <>
                      {t("رخصة المجلس القومي للمبيدات:", "Pesticides Council licence:")} <bdi className="figure">{s.pesticide_licence_no}</bdi>{" · "}
                    </>
                  )}
                  {s.seed_registration_no && (
                    <>
                      {t("تسجيل التقاوي:", "Seed registration:")} <bdi className="figure">{s.seed_registration_no}</bdi>{" · "}
                    </>
                  )}
                  {s.commercial_registration_no && (
                    <>
                      {t("السجلّ التجاري:", "Commercial reg.:")} <bdi className="figure">{s.commercial_registration_no}</bdi>
                    </>
                  )}
                </p>
                {items.length > 0 && (
                  <ul className="mt-3">
                    {items.slice(0, 4).map((p) => (
                      <ProductRow key={p.id} p={p} locale={locale} rate={rate} />
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <ContactButtons supplier={s} locale={locale} />
                  <Link href={`/suppliers/${s.id}`} className="text-sm text-primary underline">
                    {items.length > 4
                      ? t(`كلّ منتجاته (${items.length}) ←`, `All ${items.length} products →`)
                      : t("صفحة المورد ←", "Supplier page →")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6">
        <OffersNotReference locale={locale} />
      </div>

      <section className={`${card} mt-8`}>
        <h2 className="font-bold">{t("كيف تشتري عبر سوداقري", "How buying through Sudagri works")}</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2 ps-5 text-sm leading-7">
          <li>{t("اختر موردًا موثّقاً قريباً منك، واتّصل به مباشرةً.", "Choose a verified supplier near you and contact them directly.")}</li>
          <li>
            {t("أو انضمّ إلى ", "Or join a ")}
            <Link href="/suppliers/orders" className="text-primary underline">
              {t("طلبٍ جماعيّ", "group order")}
            </Link>
            {t(
              " تنظّمه جمعيتك: حمولة شاحنةٍ كاملة بسعرٍ أفضل، تصل نقطة استلامٍ في يومٍ معلن.",
              " run by your cooperative: a full truckload at a better price, arriving at a pickup point on an announced day.",
            )}
          </li>
          <li>
            {t("وإن شككت في منتج، ", "If you doubt a product, ")}
            <Link href="/verify" className="text-primary underline">
              {t("تحقّق من رقم تسجيله أو أبلغ عنه", "check its registration number or report it")}
            </Link>
            .
          </li>
        </ol>
      </section>

      <div className="mt-6">
        <LicenceRequirements locale={locale} />
      </div>
    </SupplyShell>
  );
}
