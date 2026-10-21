import SectionTabs from "@/components/SectionTabs";
import ActionNotice from "@/components/ActionNotice";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

/**
 * The frame every supply page shares: the section's tabs and the one-line
 * result of the last action (?ok= / ?error=), as the /nafir pages do.
 */
const TABS = [
  { href: "/suppliers", ar: "الموردون", en: "Suppliers" },
  { href: "/suppliers/orders", ar: "الطلبات الجماعية", en: "Group orders" },
  { href: "/suppliers/deliveries", ar: "التوصيل", en: "Deliveries" },
  { href: "/verify", ar: "تحقّق من منتج", en: "Check a product" },
  { href: "/suppliers/mine", ar: "أنا مورد", en: "I am a supplier" },
];

export default async function SupplyShell({
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
      <SectionTabs
        label={tr(locale, "أقسام المدخلات", "Inputs sections")}
        moreLabel={tr(locale, "المزيد", "More")}
        active={active}
        tabs={TABS.map((t) => ({ href: t.href, label: tr(locale, t.ar, t.en) }))}
      />
      <ActionNotice ok={ok} error={error} />
      {children}
    </div>
  );
}

/**
 * Shown where live data would be while the migration is not yet applied. The
 * page around it still explains the whole thing, so a visitor learns what is
 * coming and what a supplier will need — not just that something is missing.
 */
export async function ComingSoon({ what }: { what?: string }) {
  const locale = await getLocale();
  return (
    <div className="rounded-2xl border border-dashed border-accent/60 bg-accent/5 px-5 py-6 text-center">
      <p className="font-bold">{tr(locale, "تُفعَّل قريباً", "Coming soon")}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        {what ??
          tr(
            locale,
            "بُنيت هذه الخدمة، وتنتظر تفعيل قاعدة بياناتها. ما تحت هذا يشرح كيف تعمل وما يلزم لها.",
            "This service is built and waiting for its database to be switched on. What follows explains how it works and what it needs.",
          )}
      </p>
    </div>
  );
}

export { field, button, ghost, card } from "@/lib/ui";
