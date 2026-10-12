import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { tr } from "@/lib/i18n";
import { SOURCES, whatsappLink, type Supplier } from "@/lib/supplyChain";
import { stateName } from "@/lib/nafir";

/**
 * The explanations that stay on every supply page whether or not the database
 * is switched on: what a supplier needs, why the platform never holds money,
 * and the Council's warning. A page that is "coming soon" still teaches.
 */

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
    {children}
  </a>
);

export function LicenceRequirements({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-bold">{t("ما يلزم المورد ليُوثَّق", "What a supplier needs to be verified")}</h2>
      <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-7">
        <li>
          <strong>{t("السجلّ التجاري", "Commercial registration")}</strong> — {t("لكلّ مورد.", "for every supplier.")}
        </li>
        <li>
          <strong>{t("رخصة تجارة المبيدات من المجلس القومي للمبيدات", "A pesticide trading licence from the National Pesticides Council")}</strong> —{" "}
          {t(
            "لمن يبيع المبيدات. قانون المبيدات لسنة 1994 يمنع بيع مبيدٍ غير مسجّلٍ أو غير موسوم، والمجلس هو الذي يرخّص التجارة؛ وتشترط الرخصة خبرة ٣ سنوات لخرّيجي وقاية النبات و١٠ سنوات لغيرهم.",
            "for anyone selling pesticides. The 1994 Pesticides Law bans selling an unregistered or unlabelled pesticide, and the Council licenses the trade; the licence requires 3 years’ experience for plant-protection graduates and 10 for others.",
          )}{" "}
          <A href={SOURCES.pesticidesLaw}>{t("القانون", "The law")}</A> · <A href={SOURCES.traderLicence}>{t("شروط الرخصة", "Licence terms")}</A>
        </li>
        <li>
          <strong>{t("التسجيل لدى الإدارة القومية للتقاوي", "Registration with the National Seed Administration")}</strong> —{" "}
          {t("لمن يبيع البذور والتقاوي (قانون التقاوي لسنة 2010). ويُعرض كلُّ صنفٍ باسمه المعتمد ورقم لوط الإكثار.", "for anyone selling seed (Seed Law 2010). Every variety is listed under its approved name and certified lot.")}
        </li>
        <li>
          <strong>{t("رقم تسجيل كلّ مبيد", "Each pesticide’s registration number")}</strong> —{" "}
          {t("لا يُعرض مبيدٌ بلا رقمه لدى المجلس، فيستطيع المزارع أن يطابقه بما على العبوة.", "no pesticide is listed without its Council number, so a farmer can match it against the pack.")}
        </li>
      </ul>
      <p className="mt-3 text-sm leading-7">
        {t(
          "يرفع المورد صورة مستنداته، ويراها المشرف بعينه، ثمّ تظهر شارة «موثّق». وأيُّ تغييرٍ لاحقٍ في الاسم أو الرخص يُسقط الشارة حتى يُراجع من جديد.",
          "The supplier uploads a photo of their documents, an administrator looks at them, and only then does the “Verified” badge appear. Any later change to the name or licences removes the badge until it is reviewed again.",
        )}
      </p>
    </section>
  );
}

export function OffersNotReference({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <p className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs leading-6">
      {t(
        "أسعار الموردين هنا عروضٌ منهم، بالدولار وحتى التاريخ المكتوب، ونحوّلها إلى الجنيه بسعر البنك اليوم. ولا ندخلها في أيّ متوسّطٍ أو سعرٍ مرجعيٍّ تنشره المنصّة: من يبيع لا يضع سعر السوق.",
        "Supplier prices here are their own offers, in dollars and until the date shown, converted to pounds at today’s bank rate. They never enter any average or reference price the platform publishes: a seller does not set the market price.",
      )}{" "}
      <Link href="/rates" className="text-primary underline">
        {t("أسعار العملات", "Exchange rates")}
      </Link>
    </p>
  );
}

export function NoMoneyHeld({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <section className="rounded-2xl border-2 border-primary/50 bg-primary/5 p-4 sm:p-5">
      <h2 className="font-bold">{t("المنصّة لا تمسك مالك أبداً", "The platform never holds your money")}</h2>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 ps-5 text-sm leading-7">
        <li>
          {t(
            "تدفع المقدّم (١٠٪ عادةً) مباشرةً إلى حساب المورد أو الجمعية المكتوب في الطلب — ببنكك أو غيره — لا إلى سوداقري.",
            "You pay the deposit (usually 10%) directly into the supplier’s or the cooperative’s account written on the order — by Bankak or otherwise — never to Sudagri.",
          )}
        </li>
        <li>{t("ثمّ تعطي المنظّم رقم التحويل، فيسجّل أنّه وصل.", "Then you give the organiser the transfer reference, and they record that it arrived.")}</li>
        <li>{t("والباقي تدفعه عند استلام بضاعتك من نقطة الاستلام.", "The rest you pay when you collect your goods at the pickup point.")}</li>
        <li>
          {t(
            "وتعثّر عضوٍ واحدٍ يُخرج تعهّده هو من الحمولة، ولا يمسّ تعهّدات غيره.",
            "One member’s default takes only their own pledge out of the load; nobody else’s is touched.",
          )}
        </li>
      </ul>
    </section>
  );
}

export function CouncilWarning({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <p className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-7">
      <strong>{t("تحذير المجلس القومي للمبيدات (13 سبتمبر 2026):", "National Pesticides Council warning (13 September 2026):")}</strong>{" "}
      {t(
        "مبيداتٌ نُهبت من المخازن تُعاد تعبئتها وتُباع، والمجلس يصادر كلّ مبيدٍ لا يُعرف مصدره. اشترِ ممّن تعرف رخصته، واحتفظ بالفاتورة، وطابق رقم التسجيل على العبوة.",
        "pesticides looted from stores are being repackaged and sold, and the Council seizes any pesticide of unknown origin. Buy from a licensed dealer, keep the invoice, and match the registration number on the pack.",
      )}{" "}
      <A href={SOURCES.councilWarning}>{t("بيان المجلس", "The Council’s statement")}</A>
    </p>
  );
}

export function ContactButtons({ supplier, locale }: { supplier: Pick<Supplier, "phone" | "whatsapp">; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`tel:${supplier.phone}`} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {t("اتّصل", "Call")} <bdi className="figure">{supplier.phone}</bdi>
      </a>
      {supplier.whatsapp && (
        <a
          href={whatsappLink(supplier.whatsapp)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary"
        >
          {t("واتساب", "WhatsApp")}
        </a>
      )}
    </div>
  );
}

export function VerifiedBadge({ locale }: { locale: Locale }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
      <span aria-hidden>✓</span> {tr(locale, "موثّق", "Verified")}
    </span>
  );
}

export function StatesList({ states, locale }: { states: string[]; locale: Locale }) {
  if (states.length === 0) return null;
  return <>{states.map((s) => stateName(s, locale)).join(locale === "en" ? ", " : "، ")}</>;
}
