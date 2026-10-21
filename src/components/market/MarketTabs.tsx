import SectionTabs from "@/components/SectionTabs";
import { tr, type Locale } from "@/lib/i18n";

/**
 * The market's pages as one section (backlog 121). They were reached from each
 * other by a back link on one, a row of «←» buttons on another and nothing on
 * the third; the prices, the offers, the input board and the exchange rates are
 * one place to the person using them, and now one row of tabs says so.
 */
export default function MarketTabs({ active, locale }: { active: string; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <SectionTabs
      label={t("أقسام السوق", "Market sections")}
      active={active}
      // One or two words each, so the four sit in one row on a phone
      // (backlog 122: tab labels «no more than two words» — CMS, BBC GEL).
      // The page's own heading carries the full name.
      tabs={[
        { href: "/market", label: t("الأسعار", "Prices") },
        { href: "/market/offers", label: t("العروض", "Offers") },
        { href: "/market/inputs", label: t("المدخلات", "Inputs") },
        { href: "/rates", label: t("العملات", "Currencies") },
      ]}
    />
  );
}
