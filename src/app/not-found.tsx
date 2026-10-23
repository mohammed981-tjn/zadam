import Link from "next/link";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { button, ghost } from "@/lib/ui";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "الصفحة غير موجودة | سوداقري", "Page not found | Sudagri") };
}

/**
 * A page that does not exist, in the reader's language (the review of 23
 * October, UX-5: it was the framework's English «404»), with the three places
 * people most often meant.
 */
export default async function NotFound() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-6xl" aria-hidden="true">🌾</p>
      <h1 className="mt-4 text-2xl font-black">{t("الصفحة غير موجودة", "This page does not exist")}</h1>
      <p className="mt-2 text-muted">
        {t(
          "ربّما تغيّر الرابط، أو كُتب ناقصاً. اختر من هنا:",
          "The link may have changed, or been cut short. Choose from here:",
        )}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className={button}>{t("الرئيسية", "Home")}</Link>
        <Link href="/lands" className={ghost}>{t("أرضي", "My land")}</Link>
        <Link href="/market" className={ghost}>{t("السوق", "Market")}</Link>
      </div>
    </div>
  );
}
