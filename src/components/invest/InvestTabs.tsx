import SectionTabs from "@/components/SectionTabs";
import { tr, type Locale } from "@/lib/i18n";

/**
 * The investor's pages as one section (backlog 124): the opportunities, the
 * projects already on offer, and the investor's own requests.
 */
export default function InvestTabs({ active, locale }: { active: string; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <SectionTabs
      label={t("أقسام الاستثمار", "Investment sections")}
      active={active}
      moreLabel={t("المزيد", "More")}
      tabs={[
        { href: "/invest", label: t("الفرص", "Opportunities") },
        { href: "/projects", label: t("المشاريع", "Projects") },
        { href: "/invest/mine", label: t("طلباتي", "My requests") },
      ]}
    />
  );
}
