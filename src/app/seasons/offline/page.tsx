import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import BlankLedgerForm from "./BlankLedgerForm";

export const metadata = { title: "قيدٌ بلا إنترنت | سوداقري" };

/**
 * «قيدٌ بلا إنترنت» (البند ١٨٤؛ قرار المالك 6 نوفمبر 2026: «نموذج فارغ فقط»).
 *
 * A season page carries one person's money and evidence, so the service worker never keeps it (public/sw.js). This
 * page carries none: a blank form, the same for everyone, which the service worker keeps so it opens in the field.
 * What is typed stays on the phone under the signed-in account; the seasons to choose from are asked for only once
 * the phone is online, and never written into the page.
 */
export default async function OfflineEntryPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader icon="wheat" eyebrow={t("مواسمي", "My seasons")} title={t("قيدٌ بلا إنترنت", "An entry with no internet")}>
        {t(
          "اكتب المصروف أو الإيراد هنا ولو بلا شبكة؛ يُحفظ على هاتفك. وحين تتّصل تختار موسمه فيُرسَل إليه. هذه الصفحة لا تحمل شيئاً من بياناتك، فتُفتح في الحقل بلا إنترنت إن فتحتها مرّةً وأنت متّصل.",
          "Write a cost or revenue here, even with no network; it is kept on your phone. When you are online you choose its season and it is sent there. This page carries none of your data, so it opens in the field with no internet once you have opened it while online.",
        )}
      </PageHeader>
      <BlankLedgerForm />
      <p className="mt-6 text-sm">
        <Link href="/seasons" className="text-primary underline">
          {t("إلى مواسمي", "To my seasons")}
        </Link>
      </p>
    </div>
  );
}
