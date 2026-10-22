import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { SUDAN_STATES, stateName } from "@/lib/nafir";
import { cropName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import { SERVICE_CATALOGUE } from "@/lib/services";
import { dateLabel, daysFromToday, isNotDeployed, today } from "@/lib/supplyChain";
import {
  AGREEMENT_STATUS,
  AREA_BANDS,
  AREA_BAND_LABEL,
  PARTNER_CROP_KEYS,
  PARTNER_KINDS,
  PARTNER_KIND_LABEL,
  SOIL_CLASS_KEYS,
  WATER_SOURCES,
  lbl,
  type PartnerAgreement,
  type PartnerCompany,
} from "@/lib/partners";
import PartnersShell from "@/components/partners/PartnersShell";
import AgreementGroups from "@/components/partners/AgreementGroups";
import { ComingSoon, button, card, field, ghost } from "@/components/supply/SupplyShell";
import { VerifiedBadge } from "@/components/supply/Explainers";
import { endAgreement, saveAgreement, savePartner, setPartnerActive } from "../actions";
import { MEMBER_COLUMNS } from "@/lib/visitorColumns";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "شركتي الشريكة | سوداقري", "My partner company | Sudagri") };
}

/** A company registers, then drafts the preliminary agreements an administrator activates. */
export default async function MyPartnerPage({
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

  let company: PartnerCompany | null = null;
  let agreements: PartnerAgreement[] = [];
  let notDeployed = false;
  if (user) {
    const { data, error } = await supabase.from("partner_companies").select(MEMBER_COLUMNS.partner_companies).eq("owner_id", user.id).maybeSingle();
    notDeployed = isNotDeployed(error);
    if (error && !notDeployed) console.error("partners/mine: company failed", error);
    company = data as unknown as PartnerCompany | null;
    if (company) {
      // The administrator's note is the owner's to read, not every member's (backlog 132).
      const { data: noteRows } = await supabase.rpc("review_notes", { p_kind: "partner_company" });
      const note = ((noteRows ?? []) as { id: string; review_note: string }[]).find((r) => r.id === company!.id);
      company = { ...company, review_note: note?.review_note ?? null };
      const { data: a } = await supabase
        .from("partner_agreements")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });
      agreements = (a ?? []) as PartnerAgreement[];
    }
  }

  return (
    <PartnersShell active="/partners/mine" ok={sp.ok} error={sp.error}>
      <h1 className="text-2xl font-black">{t("سجّل شركتك شريكاً لسوداقري", "Register your company as a Sudagri partner")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "التسجيل مجّاني. تكتب بيانات شركتك وسجلّها التجاري، فيراه المشرف ويمنحك شارة «موثّقة». ثمّ تكتب اتّفاقاً مبدئيّاً يحدّد المزارع التي تخدمها، فإذا فعّله المشرف ظهرت لك المزارع المطابقة.",
          "Registration is free. You enter your company’s details and commercial registration; an administrator checks it and gives you the “Verified” badge. Then you write a preliminary agreement naming the farms you serve; once an administrator activates it, the matching farms appear for you.",
        )}
      </p>

      {!user ? (
        <p className={`${card} mt-6 text-sm`}>
          <Link href="/login" className="font-medium text-primary underline">
            {t("سجّل الدخول", "Sign in")}
          </Link>{" "}
          {t("لتسجّل شركتك.", "to register your company.")}
        </p>
      ) : notDeployed ? (
        <div className="mt-6">
          <ComingSoon
            what={t(
              "تسجيل الشركات الشريكة يُفعَّل قريباً. جهّز الآن: رقم السجلّ التجاري، والولايات التي تعمل فيها، والخدمات التي تقدّمها وأسعارها الإرشاديّة.",
              "Partner registration opens soon. Get ready now: your commercial registration number, the states you work in, and the services you offer with their indicative prices.",
            )}
          />
        </div>
      ) : (
        <>
          {company && <Status company={company} locale={locale} />}

          <section className={`${card} mt-6`}>
            <h2 className="font-bold">{company ? t("بيانات الشركة", "Company details") : t("١) بيانات الشركة", "1) Company details")}</h2>
            <form action={savePartner} className="mt-3 flex flex-col gap-3">
              <input name="name" required minLength={3} maxLength={120} defaultValue={company?.name} className={field} placeholder={t("اسم الشركة", "Company name")} aria-label={t("الاسم", "Name")} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  {t("رقم السجلّ التجاري", "Commercial registration no.")}
                  <input name="commercial_registration_no" maxLength={60} defaultValue={company?.commercial_registration_no ?? ""} className={field} dir="ltr" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("اسم المسؤول", "Contact person")}
                  <input name="contact_name" required minLength={3} maxLength={80} defaultValue={company?.contact_name} className={field} />
                </label>
                <input name="phone" required inputMode="tel" defaultValue={company?.phone} className={field} placeholder={t("الهاتف: 0912345678", "Phone: 0912345678")} aria-label={t("الهاتف", "Phone")} dir="ltr" />
                <input name="whatsapp" inputMode="tel" defaultValue={company?.whatsapp ?? ""} className={field} placeholder={t("واتساب (اختياري)", "WhatsApp (optional)")} aria-label={t("واتساب", "WhatsApp")} dir="ltr" />
              </div>
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1">{t("ماذا تقدّم شركتك؟", "What does your company offer?")}</legend>
                <div className="flex flex-wrap gap-3">
                  {PARTNER_KINDS.map((k) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input type="checkbox" name="kinds" value={k} defaultChecked={company?.kinds.includes(k)} className="size-4" />
                      {lbl(PARTNER_KIND_LABEL[k], locale)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <details className="text-sm" open={!company}>
                <summary className="cursor-pointer">{t("الولايات التي تعمل فيها", "States you work in")}</summary>
                <StateBoxes name="states" checked={company?.states ?? []} locale={locale} />
              </details>
              <textarea name="bio" maxLength={1000} rows={2} defaultValue={company?.bio ?? ""} className={field} placeholder={t("نبذة (اختياري): منذ متى تعمل، وما معدّاتك وخبرتك", "About (optional): how long you have worked, your equipment and experience")} aria-label={t("نبذة", "About")} />
              <p className="text-xs text-muted">
                {t(
                  "تغيير الاسم أو السجلّ، أو إضافة نوع خدمةٍ جديد بعد التوثيق، يُعيد طلبك إلى المراجعة.",
                  "Changing the name or registration, or adding a new kind of service after verification, sends your listing back for review.",
                )}
              </p>
              <button className={`${button} self-start`}>{t("احفظ", "Save")}</button>
            </form>
          </section>

          {company && (
            <section className={`${card} mt-6`}>
              <h2 className="font-bold">{t("٢) الاتّفاقات المبدئيّة", "2) Preliminary agreements")}</h2>
              <p className="mt-1 text-sm leading-7 text-muted">
                {t(
                  "الاتّفاق يحدّد مجموعة المزارع التي تخدمها، والخدمات، والشروط والأسعار الإرشاديّة، ومدّته. وأيّ بُعدٍ تتركه فارغاً يعني «أيّاً كان». يفعّله المشرف، وبعد تفعيله لا يُعدَّل: تنهيه وتكتب مسوّدةً جديدة.",
                  "An agreement names the group of farms you serve, the services, the terms and indicative prices, and its duration. Any dimension left empty means “any”. An administrator activates it, and once active it cannot be edited: you end it and write a new draft.",
                )}
              </p>

              {agreements.length > 0 && (
                <ul className="mt-4 flex flex-col gap-3">
                  {agreements.map((a) => (
                    <li key={a.id} className={`rounded-xl border border-border px-3 py-3 ${a.status === "ended" ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          <bdi>{a.title}</bdi>
                        </p>
                        <span className={`text-xs font-medium ${a.status === "active" ? "text-primary" : "text-muted"}`}>{lbl(AGREEMENT_STATUS[a.status], locale)}</span>
                      </div>
                      <p className="text-xs text-muted">
                        {dateLabel(a.valid_from, locale)} — {dateLabel(a.valid_until, locale)}
                      </p>
                      <AgreementGroups a={a} locale={locale} />
                      {a.status === "draft" && (
                        <details className="mt-2 text-sm">
                          <summary className="cursor-pointer text-primary">{t("عدّل المسوّدة", "Edit the draft")}</summary>
                          <AgreementForm locale={locale} a={a} />
                        </details>
                      )}
                      {a.status !== "ended" && (
                        <form action={endAgreement} className="mt-2">
                          <input type="hidden" name="agreement_id" value={a.id} />
                          <button className={ghost}>{a.status === "draft" ? t("ألغِ المسوّدة", "Cancel the draft") : t("أنهِ الاتّفاق", "End the agreement")}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <details className="mt-4 text-sm" open={agreements.length === 0}>
                <summary className="cursor-pointer font-medium text-primary">{t("اكتب اتّفاقاً جديداً", "Write a new agreement")}</summary>
                <AgreementForm locale={locale} />
              </details>
            </section>
          )}

          {company && (
            <section className={`${card} mt-6 flex flex-wrap items-center justify-between gap-3`}>
              <p className="text-sm">
                {company.active
                  ? t("شركتك ظاهرة في الدليل.", "Your company is listed.")
                  : t("شركتك موقوفة مؤقّتاً ولا تظهر في الدليل.", "Your company is paused and not listed.")}
              </p>
              <form action={setPartnerActive}>
                <input type="hidden" name="company_id" value={company.id} />
                <input type="hidden" name="active" value={company.active ? "false" : "true"} />
                <button className={ghost}>{company.active ? t("أوقف مؤقّتاً", "Pause") : t("أعد الظهور", "List again")}</button>
              </form>
            </section>
          )}
        </>
      )}
    </PartnersShell>
  );
}

function Status({ company, locale }: { company: PartnerCompany; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <section className={`${card} mt-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{t("حالة الشركة", "Company status")}</h2>
        {company.verified_at ? <VerifiedBadge locale={locale} /> : <span className="text-xs font-medium text-accent">{t("بانتظار المراجعة", "Awaiting review")}</span>}
      </div>
      {company.verified_at ? (
        <p className="mt-1 text-sm">
          {t("ظاهرة في دليل الشركات الشريكة. ", "Listed in the partner directory. ")}
          <Link href="/partners/lands" className="text-primary underline">
            {t("المزارع المطابقة لاتّفاقاتك ←", "Farms matching your agreements →")}
          </Link>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">
          {company.commercial_registration_no
            ? t("يراجع المشرف السجلّ التجاري، ثمّ تظهر الشركة في الدليل.", "An administrator is checking the commercial registration; then the company is listed.")
            : t("أضف رقم السجلّ التجاري: لا تُوثَّق شركة بدونه.", "Add the commercial registration number: no company is verified without it.")}
        </p>
      )}
      {company.review_note && <p className="mt-2 rounded-lg bg-background px-3 py-2 text-xs text-muted">{company.review_note}</p>}
    </section>
  );
}

function StateBoxes({ name, checked, locale }: { name: string; checked: string[]; locale: Locale }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {SUDAN_STATES.map((s) => (
        <label key={s} className="flex items-center gap-1.5">
          <input type="checkbox" name={name} value={s} defaultChecked={checked.includes(s)} className="size-4" />
          {stateName(s, locale)}
        </label>
      ))}
    </div>
  );
}

function Boxes({ name, options, checked }: { name: string; options: { value: string; label: string }[]; checked: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-1.5">
          <input type="checkbox" name={name} value={o.value} defaultChecked={checked.includes(o.value)} className="size-4" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function AgreementForm({ locale, a }: { locale: Locale; a?: PartnerAgreement }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <form action={saveAgreement} className="mt-3 flex flex-col gap-3">
      {a && <input type="hidden" name="agreement_id" value={a.id} />}
      <input name="title" required minLength={5} maxLength={120} defaultValue={a?.title} className={field} placeholder={t("عنوان الاتّفاق: مثلاً «القضارف المطريّة — حراثة وحصاد»", "Title: e.g. “Gedaref rainfed — ploughing and harvest”")} aria-label={t("العنوان", "Title")} />
      <details>
        <summary className="cursor-pointer">{t("الولايات (فارغ = ولايات شركتك كلّها)", "States (empty = all your company’s states)")}</summary>
        <StateBoxes name="states" checked={a?.states ?? []} locale={locale} />
      </details>
      <fieldset>
        <legend>{t("مصدر الماء", "Water source")}</legend>
        <Boxes name="water_sources" options={WATER_SOURCES.map((w) => ({ value: w, label: waterSourceLabel(w, locale) }))} checked={a?.water_sources ?? []} />
      </fieldset>
      <fieldset>
        <legend>{t("فئة المساحة", "Area band")}</legend>
        <Boxes name="area_bands" options={AREA_BANDS.map((b) => ({ value: b, label: lbl(AREA_BAND_LABEL[b], locale) }))} checked={a?.area_bands ?? []} />
      </fieldset>
      <details>
        <summary className="cursor-pointer">{t("أصناف التربة", "Soil classes")}</summary>
        <Boxes name="soil_classes" options={SOIL_CLASS_KEYS.map((s) => ({ value: s, label: locale === "en" ? wrbShortEn(s) : wrbShort(s) }))} checked={a?.soil_classes ?? []} />
      </details>
      <details>
        <summary className="cursor-pointer">{t("المحاصيل", "Crops")}</summary>
        <Boxes name="crop_keys" options={PARTNER_CROP_KEYS.map((c) => ({ value: c, label: cropName(c, locale) }))} checked={a?.crop_keys ?? []} />
      </details>
      <details open={!a}>
        <summary className="cursor-pointer">{t("الخدمات التي تقدّمها في هذا الاتّفاق", "Services you offer under this agreement")}</summary>
        <Boxes
          name="services"
          options={SERVICE_CATALOGUE.filter((s) => s.production !== "livestock").map((s) => ({ value: s.key, label: locale === "en" ? s.nameEn : s.name }))}
          checked={a?.services ?? []}
        />
      </details>
      <textarea
        name="terms"
        required
        minLength={20}
        maxLength={3000}
        rows={4}
        defaultValue={a?.terms}
        className={field}
        placeholder={t(
          "الشروط والأسعار الإرشاديّة: مثلاً «الحراثة بالفدان بسعرٍ إرشاديٍّ كذا، والحصاد كذا، ونبدأ خلال أسبوعين من العقد». السعر النهائيّ يُكتب في عقد الخدمة.",
          "Terms and indicative prices: e.g. “ploughing per feddan at an indicative price of …, harvest at …, we start within two weeks of the contract”. The final price is written in the service contract.",
        )}
        aria-label={t("الشروط", "Terms")}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          {t("من", "From")}
          <input type="date" name="valid_from" required defaultValue={a?.valid_from ?? today()} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          {t("إلى (ثلاث سنوات على الأكثر)", "Until (three years at most)")}
          <input type="date" name="valid_until" required defaultValue={a?.valid_until ?? daysFromToday(365)} className={field} />
        </label>
      </div>
      <button className={`${button} self-start`}>{a ? t("احفظ المسوّدة", "Save the draft") : t("أرسل المسوّدة للمشرف", "Send the draft for review")}</button>
    </form>
  );
}
