import Link from "next/link";
import { currentFx } from "@/lib/livePrices";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { SUDAN_STATES, stateName } from "@/lib/nafir";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  INPUT_KEYS,
  INPUT_LABEL,
  PACK_UNITS,
  PACK_UNIT_LABEL,
  isNotDeployed,
  lbl,
  today,
  daysFromToday,
  type Supplier,
  type SupplierProduct,
} from "@/lib/supplyChain";
import SupplyShell, { ComingSoon, button, card, field, ghost } from "@/components/supply/SupplyShell";
import PhotoField from "@/components/supply/PhotoField";
import ProductRow from "@/components/supply/ProductRow";
import { LicenceRequirements, OffersNotReference, VerifiedBadge } from "@/components/supply/Explainers";
import { removeProduct, saveProduct, saveSupplier, setSupplierActive, setSupplierDocument } from "../actions";
import { MEMBER_COLUMNS } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "صفحتي كمورد | سوداقري", "My supplier page | Sudagri") };
}

/** A supplier registers, uploads the licence documents, and keeps a product list with dated dollar prices. */
export default async function MySupplierPage({
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

  let supplier: Supplier | null = null;
  let products: SupplierProduct[] = [];
  let notDeployed = false;
  if (user) {
    // The owner's own columns come from supplier_private() (backlog 181): a member does not read suppliers.owner_id.
    type Priv = { id: string; owner_id: string; licence_doc_path: string | null; verified_by: string | null };
    const { data: privRows, error } = await supabase.rpc("supplier_private");
    notDeployed = isNotDeployed(error);
    const own = ((privRows ?? []) as Priv[]).find((r) => r.owner_id === user.id) ?? null;
    if (own) {
      const { data } = await supabase.from("suppliers").select(MEMBER_COLUMNS.suppliers).eq("id", own.id).maybeSingle();
      supplier = data ? ({ ...(data as unknown as Supplier), ...own } as Supplier) : null;
    }
    if (supplier) {
      // The administrator's note is the owner's to read, not every member's (backlog 132).
      const { data: noteRows } = await supabase.rpc("review_notes", { p_kind: "supplier" });
      const note = ((noteRows ?? []) as { id: string; review_note: string }[]).find((r) => r.id === supplier!.id);
      supplier = { ...supplier, review_note: note?.review_note ?? null };
      const { data: p } = await supabase
        .from("supplier_products")
        .select("*")
        .eq("supplier_id", supplier.id)
        .order("active", { ascending: false })
        .order("name");
      products = (p ?? []) as SupplierProduct[];
    }
  }
  const rate = (await currentFx())?.bank.sell ?? null;

  return (
    <SupplyShell active="/suppliers/mine" ok={sp.ok} error={sp.error}>
      <h1 className="text-2xl font-black">{t("سجّل متجرك مورداً موثّقاً", "Register your shop as a verified supplier")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "التسجيل مجّاني. تكتب بياناتك ورخصك، وترفع صورتها، فيراها المشرف ويمنحك شارة «موثّق». بعدها يجدك المزارعون حين يبحثون عن مدخلٍ في ولايتك، وتستطيع الجمعيات أن تفتح عليك طلباتٍ جماعية بحمولة شاحنة.",
          "Registration is free. You enter your details and licences and upload a photo of them; an administrator reviews them and gives you the “Verified” badge. Farmers then find you when they search for an input in your state, and cooperatives can open truckload group orders with you.",
        )}
      </p>

      {!user ? (
        <p className={`${card} mt-6 text-sm`}>
          <Link href="/login" className="font-medium text-primary underline">
            {t("سجّل الدخول", "Sign in")}
          </Link>{" "}
          {t("لتسجّل متجرك.", "to register your shop.")}
        </p>
      ) : notDeployed ? (
        <div className="mt-6">
          <ComingSoon
            what={t(
              "تسجيل الموردين يُفعَّل قريباً. جهّز الآن: رقم السجلّ التجاري، ورخصة المجلس القومي للمبيدات إن كنت تبيع المبيدات، وتسجيل الإدارة القومية للتقاوي إن كنت تبيع البذور، وصورةً واضحةً لها.",
              "Supplier registration opens soon. Get ready now: your commercial registration number, your National Pesticides Council licence if you sell pesticides, your National Seed Administration registration if you sell seed, and a clear photo of them.",
            )}
          />
        </div>
      ) : (
        <>
          {supplier && <Status supplier={supplier} locale={locale} />}

          <section className={`${card} mt-6`}>
            <h2 className="font-bold">{supplier ? t("بيانات المورد", "Supplier details") : t("١) بيانات المورد", "1) Supplier details")}</h2>
            <form action={saveSupplier} className="mt-3 flex flex-col gap-3">
              <input name="name" required minLength={3} maxLength={100} defaultValue={supplier?.name} className={field} placeholder={t("اسم المتجر أو الشركة", "Shop or company name")} aria-label={t("الاسم", "Name")} />
              <div className="grid gap-3 sm:grid-cols-2">
                <select name="state" required defaultValue={supplier?.state ?? ""} className={field} aria-label={t("الولاية", "State")}>
                  <option value="" disabled>
                    {t("الولاية", "State")}
                  </option>
                  {SUDAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {stateName(s, locale)}
                    </option>
                  ))}
                </select>
                <input name="locality" required minLength={2} maxLength={80} defaultValue={supplier?.locality} className={field} placeholder={t("المحلية أو السوق", "Locality or market")} aria-label={t("المحلية", "Locality")} />
                <input name="phone" required inputMode="tel" defaultValue={supplier?.phone} className={field} placeholder={t("الهاتف: 0912345678", "Phone: 0912345678")} aria-label={t("الهاتف", "Phone")} dir="ltr" />
                <input name="whatsapp" inputMode="tel" defaultValue={supplier?.whatsapp ?? ""} className={field} placeholder={t("واتساب (اختياري)", "WhatsApp (optional)")} aria-label={t("واتساب", "WhatsApp")} dir="ltr" />
              </div>
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1">{t("ماذا تبيع؟", "What do you sell?")}</legend>
                <div className="flex flex-wrap gap-3">
                  {CATEGORIES.map((c) => (
                    <label key={c} className="flex items-center gap-1.5">
                      <input type="checkbox" name="categories" value={c} defaultChecked={supplier?.categories.includes(c)} className="size-4" />
                      {lbl(CATEGORY_LABEL[c], locale)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <details className="text-sm" open={!supplier}>
                <summary className="cursor-pointer">{t("الولايات التي توصل إليها", "States you deliver to")}</summary>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SUDAN_STATES.map((s) => (
                    <label key={s} className="flex items-center gap-1.5">
                      <input type="checkbox" name="delivery_states" value={s} defaultChecked={supplier?.delivery_states.includes(s)} className="size-4" />
                      {stateName(s, locale)}
                    </label>
                  ))}
                </div>
              </details>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  {t("رقم السجلّ التجاري", "Commercial registration no.")}
                  <input name="commercial_registration_no" maxLength={60} defaultValue={supplier?.commercial_registration_no ?? ""} className={field} dir="ltr" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("رخصة المجلس القومي للمبيدات", "Pesticides Council licence no.")}
                  <input name="pesticide_licence_no" maxLength={60} defaultValue={supplier?.pesticide_licence_no ?? ""} className={field} dir="ltr" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("تسجيل الإدارة القومية للتقاوي", "Seed Administration registration no.")}
                  <input name="seed_registration_no" maxLength={60} defaultValue={supplier?.seed_registration_no ?? ""} className={field} dir="ltr" />
                </label>
              </div>
              <textarea name="bio" maxLength={1000} rows={2} defaultValue={supplier?.bio ?? ""} className={field} placeholder={t("نبذة (اختياري): منذ متى تعمل، وما تختصّ به", "About (optional): how long you have traded, what you specialise in")} aria-label={t("نبذة", "About")} />
              <p className="text-xs text-muted">
                {t(
                  "تغيير الاسم أو أرقام الرخص بعد التوثيق يُعيد طلبك إلى المراجعة.",
                  "Changing the name or licence numbers after verification sends your listing back for review.",
                )}
              </p>
              <button className={`${button} self-start`}>{t("احفظ", "Save")}</button>
            </form>
          </section>

          {supplier && (
            <section className={`${card} mt-6`}>
              <h2 className="font-bold">{t("٢) صورة المستندات", "2) Document photo")}</h2>
              <p className="mt-1 text-sm text-muted">
                {t(
                  "صورةٌ واضحةٌ للسجلّ التجاري والرخص (أو ملفّ PDF). تُحفظ في مجلّدك الخاصّ ولا يراها إلا المشرف.",
                  "A clear photo of the commercial registration and licences (or a PDF). It is kept in your private folder and only an administrator sees it.",
                )}
              </p>
              {supplier.licence_doc_path && <p className="mt-1 text-xs text-primary">{t("✓ رُفعت صورة المستندات.", "✓ Document photo uploaded.")}</p>}
              <form action={setSupplierDocument} className="mt-3 flex flex-col gap-3">
                <PhotoField name="doc_path" folder="suppliers" pdf label={supplier.licence_doc_path ? t("استبدل الصورة", "Replace the photo") : t("اختر الصورة", "Choose the photo")} />
                <button className={`${button} self-start`}>{t("أرسل للمراجعة", "Send for review")}</button>
              </form>
            </section>
          )}

          {supplier && (
            <section className={`${card} mt-6`}>
              <h2 className="font-bold">{t("٣) منتجاتك وأسعارك", "3) Your products and prices")}</h2>
              <p className="mt-1 text-sm text-muted">
                {t(
                  "السعر بالدولار، حتى تاريخٍ تحدّده (سنةٌ على الأكثر)، ونعرضه بالجنيه بسعر بنك الخرطوم اليوم. المبيد يُعرض برقم تسجيله لدى المجلس، والبذور باسم صنفها المعتمد.",
                  "Price in dollars, valid until a date you set (a year at most), shown in pounds at Bank of Khartoum’s rate today. A pesticide is listed with its Council registration number, seed under its approved variety.",
                )}
              </p>
              {products.length > 0 && (
                <ul className="mt-3">
                  {products.map((p) => (
                    <li key={p.id} className={p.active ? "" : "opacity-50"}>
                      <ul>
                        <ProductRow p={p} locale={locale} rate={rate} />
                      </ul>
                      <details className="mb-3 text-sm">
                        <summary className="cursor-pointer text-primary">{t("عدّل", "Edit")}</summary>
                        <ProductForm locale={locale} p={p} />
                      </details>
                      {p.active && (
                        <form action={removeProduct} className="mb-3">
                          <input type="hidden" name="product_id" value={p.id} />
                          <button className="text-xs text-danger underline">{t("أوقف عرضه", "Stop listing it")}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mt-4 text-sm font-bold">{t("أضف منتجاً", "Add a product")}</h3>
              <ProductForm locale={locale} />
            </section>
          )}

          {supplier && (
            <form action={setSupplierActive} className="mt-6">
              <input type="hidden" name="supplier_id" value={supplier.id} />
              <input type="hidden" name="active" value={supplier.active ? "false" : "true"} />
              <button className={ghost}>{supplier.active ? t("أوقف ظهوري مؤقّتاً", "Pause my listing") : t("أعد إظهاري", "Show my listing again")}</button>
            </form>
          )}
        </>
      )}

      <div className="mt-8 flex flex-col gap-4">
        <LicenceRequirements locale={locale} />
        <OffersNotReference locale={locale} />
      </div>
    </SupplyShell>
  );
}

function Status({ supplier, locale }: { supplier: Supplier; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <div className={`mt-6 rounded-2xl border p-4 ${supplier.verified_at ? "border-primary/50 bg-primary/5" : "border-accent/60 bg-accent/5"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {supplier.verified_at ? (
          <VerifiedBadge locale={locale} />
        ) : (
          <span className="font-bold">{t("بانتظار التوثيق", "Awaiting verification")}</span>
        )}
        {!supplier.active && <span className="text-sm text-danger">{t("موقوفٌ مؤقّتاً", "Paused")}</span>}
        {supplier.verified_at && (
          <Link href={`/suppliers/${supplier.id}`} className="text-sm text-primary underline">
            {t("صفحتك كما يراها الناس ←", "Your public page →")}
          </Link>
        )}
      </div>
      {!supplier.verified_at && !supplier.licence_doc_path && (
        <p className="mt-1 text-sm">{t("الخطوة التالية: ارفع صورة المستندات.", "Next step: upload the document photo.")}</p>
      )}
      {!supplier.verified_at && supplier.licence_doc_path && (
        <p className="mt-1 text-sm">{t("وصلت مستنداتك، ويراجعها المشرف.", "Your documents arrived and are being reviewed.")}</p>
      )}
      {supplier.review_note && (
        <p className="mt-1 text-sm">
          {t("ملاحظة المشرف:", "Administrator’s note:")} <bdi>{supplier.review_note}</bdi>
        </p>
      )}
    </div>
  );
}

function ProductForm({ locale, p }: { locale: Locale; p?: SupplierProduct }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const inMonth = daysFromToday(30);
  const inYear = daysFromToday(365);
  return (
    <form action={saveProduct} className="mt-2 flex flex-col gap-3">
      {p && <input type="hidden" name="product_id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="category" required defaultValue={p?.category ?? ""} className={field} aria-label={t("الصنف", "Category")}>
          <option value="" disabled>
            {t("الصنف", "Category")}
          </option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {lbl(CATEGORY_LABEL[c], locale)}
            </option>
          ))}
        </select>
        <select name="input_key" defaultValue={p?.input_key ?? ""} className={field} aria-label={t("المدخل", "Input")}>
          <option value="">{t("المدخل (ليظهر في دراسة الجدوى)", "Input (to appear in the feasibility study)")}</option>
          {INPUT_KEYS.map((k) => (
            <option key={k} value={k}>
              {lbl(INPUT_LABEL[k], locale)}
            </option>
          ))}
        </select>
      </div>
      <input name="name" required minLength={2} maxLength={120} defaultValue={p?.name} className={field} placeholder={t("اسم المنتج التجاري", "Trade name")} aria-label={t("الاسم", "Name")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <input name="active_ingredient" maxLength={200} defaultValue={p?.active_ingredient ?? ""} className={field} placeholder={t("المادة الفعّالة وتركيزها", "Active ingredient and strength")} aria-label={t("المادة الفعّالة", "Active ingredient")} />
        <input name="registration_no" maxLength={60} defaultValue={p?.registration_no ?? ""} className={field} placeholder={t("رقم التسجيل / الصنف المعتمد", "Registration no. / approved variety")} aria-label={t("رقم التسجيل", "Registration no.")} />
        <input name="cert_lot" maxLength={60} defaultValue={p?.cert_lot ?? ""} className={field} placeholder={t("لوط الإكثار (للبذور)", "Certified lot (seed)")} aria-label={t("لوط الإكثار", "Certified lot")} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("حجم العبوة", "Pack size")}
          <input name="pack_size" type="number" required min={0.001} step="any" defaultValue={p?.pack_size} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("الوحدة", "Unit")}
          <select name="pack_unit" required defaultValue={p?.pack_unit ?? "kg"} className={field}>
            {PACK_UNITS.map((u) => (
              <option key={u} value={u}>
                {lbl(PACK_UNIT_LABEL[u], locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("السعر بالدولار", "Price, US$")}
          <input name="price_usd" type="number" required min={0.01} step="0.01" defaultValue={p?.price_usd} className={field} dir="ltr" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("سارٍ حتى", "Valid until")}
          <input name="valid_until" type="date" required min={today()} max={inYear} defaultValue={p && p.valid_until >= today() ? p.valid_until : inMonth} className={field} />
        </label>
      </div>
      <button className={`${button} self-start`}>{p ? t("احفظ التعديل", "Save changes") : t("أضف المنتج", "Add the product")}</button>
    </form>
  );
}
