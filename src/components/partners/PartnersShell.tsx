import SectionTabs from "@/components/SectionTabs";
import ActionNotice from "@/components/ActionNotice";
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
    <div className="mx-auto max-w-4xl px-4 py-8 lg:max-w-6xl xl:max-w-7xl">
      <SectionTabs
        label={tr(locale, "أقسام الشركاء", "Partner sections")}
        active={active}
        tabs={TABS.map((t) => ({ href: t.href, label: tr(locale, t.ar, t.en) }))}
      />
      <ActionNotice ok={ok} error={error} />
      {children}
    </div>
  );
}
