import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

/**
 * The frame every partner page shares: the section's tabs and the one-line
 * result of the last action (?ok= / ?error=), as SupplyShell does for inputs.
 */
const TABS = [
  { href: "/how-we-work", ar: "إجراءات العمل", en: "How we work" },
  { href: "/partners", ar: "الشركات الشريكة", en: "Partner companies" },
  { href: "/partners/lands", ar: "المزارع المطابقة", en: "Matching farms" },
  { href: "/partners/mine", ar: "شركتي", en: "My company" },
];

export default async function PartnersShell({
  active,
  ok,
  error,
  children,
}: {
  active: string;
  ok?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav aria-label={tr(locale, "أقسام الشركاء", "Partner sections")} className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.href === active ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              t.href === active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary"
            }`}
          >
            {tr(locale, t.ar, t.en)}
          </Link>
        ))}
      </nav>
      {ok && (
        <p role="status" className="mb-6 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          {ok}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}
