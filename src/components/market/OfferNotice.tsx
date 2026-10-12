import { tr, type Locale } from "@/lib/i18n";

/** The rule every offer sits under, shown on the list and on the form. */
export default function OfferNotice({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm leading-relaxed">
      <p className="font-bold text-danger">{t("قبل أن تتّصل", "Before you call")}</p>
      <p className="mt-1">
        {t(
          "المنصّة لوحة إعلانات فقط: لا تمسك مالاً، ولا تأخذ عمولة، ولا تضمن الجودة ولا التسليم. افحص البضاعة بنفسك، وادفع عند الاستلام، ولا تحوّل مالاً مقدّماً لمن لا تعرفه.",
          "The platform is a notice board only: it holds no money, takes no commission, and guarantees neither quality nor delivery. Inspect the goods yourself, pay on delivery, and never send money in advance to someone you do not know.",
        )}
      </p>
    </div>
  );
}
