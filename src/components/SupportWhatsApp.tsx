import { supportLine } from "@/lib/support";
import { tr, type Locale } from "@/lib/i18n";

/** «تواصل معنا على واتساب» with the stated hours, or nothing when no number is set (lib/support.ts). */
export default function SupportWhatsApp({ locale, className = "" }: { locale: Locale; className?: string }) {
  const line = supportLine();
  if (!line) return null;
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const hours = locale === "en" ? line.hours.en ?? line.hours.ar : line.hours.ar ?? line.hours.en;
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <a
        href={line.href}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5"
      >
        {t("تواصل معنا على واتساب", "Contact us on WhatsApp")}
      </a>
      {hours && <p className="text-xs text-muted">{t(`نردّ ${hours}`, `We reply ${hours}`)}</p>}
    </div>
  );
}
