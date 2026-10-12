import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { SUDAN_STATES, stateName } from "@/lib/nafir";
import { CATEGORY_LABEL, PACK_UNIT_LABEL, SOURCES, isNotDeployed, lbl, num, type Category, type PackUnit } from "@/lib/supplyChain";
import SupplyShell, { ComingSoon, button, card, field } from "@/components/supply/SupplyShell";
import PhotoField from "@/components/supply/PhotoField";
import { CouncilWarning } from "@/components/supply/Explainers";
import { submitReport } from "./actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "تحقّق من منتج | سوداقري", "Check a product | Sudagri"),
    description: tr(
      locale,
      "اكتب رقم تسجيل المبيد أو صنف البذور لترى إن كان يبيعه موردٌ موثّق، وأبلغ عن منتجٍ مشبوه.",
      "Enter a pesticide registration number or seed variety to see whether a verified supplier sells it, and report a suspicious product.",
    ),
  };
}

interface Match {
  product_name: string;
  category: Category;
  active_ingredient: string | null;
  registration_no: string | null;
  cert_lot: string | null;
  pack_size: number;
  pack_unit: PackUnit;
  supplier_id: string;
  supplier_name: string;
  supplier_state: string;
}

/** الحماية من الغشّ: بحثٌ برقم التسجيل، وبلاغٌ عن منتجٍ مشبوه. */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const typed = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};
  const code = (sp.code ?? "").trim().slice(0, 60);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let matches: Match[] = [];
  let notDeployed = false;
  if (code.length >= 3) {
    const { data, error } = await supabase.rpc("verify_registration", { p_code: code });
    notDeployed = isNotDeployed(error);
    if (error && !notDeployed) console.error("verify: lookup failed", error);
    matches = (data ?? []) as Match[];
  }

  return (
    <SupplyShell active="/verify" ok={sp.ok} error={sp.error}>
      <h1 className="text-2xl font-black">{t("تحقّق من منتج قبل أن تشتريه", "Check a product before you buy it")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "اكتب رقم التسجيل المكتوب على عبوة المبيد، أو اسم صنف البذور، أو رقم اللوط. نبحث عنه في منتجات الموردين الموثّقين على المنصّة.",
          "Enter the registration number printed on the pesticide pack, the seed variety, or the lot number. We look for it among the products of verified suppliers on the platform.",
        )}
      </p>

      <div className="mt-5">
        <CouncilWarning locale={locale} />
      </div>

      <form method="get" className={`${card} mt-6 flex flex-col gap-3 sm:flex-row sm:items-end`}>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("رقم التسجيل أو رمز العبوة", "Registration number or pack code")}
          <input name="code" required minLength={3} maxLength={60} defaultValue={code} className={`${field} figure`} dir="ltr" placeholder="PCB-1234/2024" />
        </label>
        <button className={button}>{t("تحقّق", "Check")}</button>
      </form>

      <p className="mt-3 rounded-xl border border-border bg-background px-4 py-3 text-xs leading-6 text-muted">
        {t(
          "تنبيهٌ أمين: هذا ليس السجلّ الرسمي للمجلس القومي للمبيدات. هو بحثٌ في المنتجات التي عرضها موردون رأينا رخصهم. فإن لم تجد الرقم هنا فهذا لا يعني أنّ المنتج مغشوش، وإن وجدته فطابق العبوة والختم أيضاً. سنربط سجلّ المجلس الرسمي حين يُتاح.",
          "An honest note: this is not the National Pesticides Council’s official register. It searches the products listed by suppliers whose licences we have seen. Not finding a number here does not mean the product is fake, and finding it does not replace checking the pack and its seal. We will link the Council’s official register once it is available.",
        )}
      </p>

      {code.length >= 3 && (
        <section className="mt-6" aria-live="polite">
          {notDeployed ? (
            <ComingSoon what={t("التحقّق يُفعَّل قريباً مع دليل الموردين.", "Checking opens soon, with the supplier directory.")} />
          ) : matches.length === 0 ? (
            <div className="rounded-2xl border border-accent/60 bg-accent/5 p-4 text-sm leading-7">
              <p className="font-bold">
                {t("لم نجد", "We did not find")} <bdi className="figure">{code}</bdi> {t("عند موردٍ موثّق على المنصّة.", "with any verified supplier on the platform.")}
              </p>
              <p className="mt-1">
                {t(
                  "تأكّد من كتابة الرقم كما على العبوة. وإن كان المنتج بلا رقم تسجيل، أو العبوة مفتوحة أو بلا ملصقٍ عربيّ، أو السعر أرخص بكثير من السوق — فلا تشترِه، وأبلغ عنه أدناه.",
                  "Check you typed the number as on the pack. If the product has no registration number, the pack is opened or has no Arabic label, or the price is far below the market — do not buy it, and report it below.",
                )}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {matches.map((m, i) => (
                <li key={`${m.supplier_id}-${i}`} className="rounded-2xl border border-primary/50 bg-primary/5 p-4">
                  <p className="font-bold" {...typed}>
                    ✓ {m.product_name}
                  </p>
                  <p className="text-sm">
                    {lbl(CATEGORY_LABEL[m.category], locale)}
                    {m.active_ingredient && (
                      <>
                        {" · "}
                        <bdi>{m.active_ingredient}</bdi>
                      </>
                    )}
                    {" · "}
                    {num(m.pack_size, locale, 3)} {lbl(PACK_UNIT_LABEL[m.pack_unit], locale)}
                  </p>
                  <p className="text-xs">
                    {m.registration_no && (
                      <>
                        {t("رقم التسجيل:", "Registration:")} <bdi className="figure">{m.registration_no}</bdi>
                      </>
                    )}
                    {m.cert_lot && (
                      <>
                        {" · "}
                        {t("اللوط:", "Lot:")} <bdi className="figure">{m.cert_lot}</bdi>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-sm">
                    {t("يبيعه:", "Sold by:")}{" "}
                    <Link href={`/suppliers/${m.supplier_id}`} className="text-primary underline" {...typed}>
                      {m.supplier_name}
                    </Link>{" "}
                    — {stateName(m.supplier_state, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section id="report" className={`${card} mt-8`}>
        <h2 className="text-lg font-bold">{t("أبلغ عن منتجٍ مشبوه", "Report a suspicious product")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t(
            "يراجع المشرف البلاغ ويحيله إلى المجلس القومي للمبيدات. قانون المبيدات لسنة 1994 يمنع بيع مبيدٍ غير مسجّلٍ أو غير موسوم.",
            "An administrator reviews the report and forwards it to the National Pesticides Council. The 1994 Pesticides Law bans selling an unregistered or unlabelled pesticide.",
          )}{" "}
          <a href={SOURCES.pesticidesLaw} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {t("نصّ القانون", "The law")}
          </a>
        </p>
        {!user ? (
          <p className="mt-3 text-sm">
            <Link href="/login" className="font-medium text-primary underline">
              {t("سجّل الدخول", "Sign in")}
            </Link>{" "}
            {t("لترسل بلاغاً بصورة — حتى نستطيع أن نسألك إن احتاج المجلس تفاصيل.", "to send a report with a photo — so we can ask you if the Council needs details.")}
          </p>
        ) : (
          <form action={submitReport} className="mt-3 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="product_name" required minLength={2} maxLength={120} className={field} placeholder={t("اسم المنتج كما على العبوة", "Product name as on the pack")} aria-label={t("اسم المنتج", "Product name")} />
              <input name="registration_no" maxLength={60} defaultValue={code} className={field} placeholder={t("رقم التسجيل (إن وُجد)", "Registration no. (if any)")} aria-label={t("رقم التسجيل", "Registration no.")} dir="ltr" />
              <input name="where_bought" required minLength={2} maxLength={200} className={field} placeholder={t("أين اشتريته: السوق، المحلّ، البائع", "Where you bought it: market, shop, seller")} aria-label={t("مكان الشراء", "Where bought")} />
              <select name="state" required defaultValue="" className={field} aria-label={t("الولاية", "State")}>
                <option value="" disabled>
                  {t("الولاية", "State")}
                </option>
                {SUDAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {stateName(s, locale)}
                  </option>
                ))}
              </select>
            </div>
            <PhotoField name="photo_path" folder="reports" label={t("صورة العبوة والملصق (يُستحسن)", "Photo of the pack and label (recommended)")} />
            <textarea name="details" maxLength={1000} rows={3} className={field} placeholder={t("ما الذي أثار شكّك؟ ختمٌ مكسور، ملصقٌ بلا عربي، سعرٌ غريب…", "What made you suspicious? Broken seal, no Arabic label, odd price…")} aria-label={t("التفاصيل", "Details")} />
            <button className={`${button} self-start`}>{t("أرسل البلاغ", "Send the report")}</button>
          </form>
        )}
      </section>

      <p className="mt-6 text-xs text-muted">
        {t("المصادر:", "Sources:")}{" "}
        <a href={SOURCES.councilWarning} target="_blank" rel="noopener noreferrer" className="underline">
          {t("بيان المجلس القومي للمبيدات، 13 سبتمبر 2026", "National Pesticides Council statement, 13 September 2026")}
        </a>{" "}
        ·{" "}
        <a href={SOURCES.pesticidesLaw} target="_blank" rel="noopener noreferrer" className="underline">
          {t("قانون المبيدات ومنتجات مكافحة الآفات لسنة 1994", "Pesticides and Pest Control Products Law, 1994")}
        </a>
      </p>
    </SupplyShell>
  );
}
