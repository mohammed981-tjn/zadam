import SectionTabs from "@/components/SectionTabs";
import ActionNotice from "@/components/ActionNotice";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

/**
 * The frame every /nafir page shares: the section's tabs and the one-line
 * result of the last action (?ok= / ?error=), so a form that redirected back
 * says what happened where the person is looking.
 */
const TABS = [
  { href: "/nafir", label: "الساحة", en: "Square" },
  { href: "/nafir/charter", label: "الميثاق", en: "Charter" },
  { href: "/nafir/faza", label: "الفزعة", en: "Faza" },
  { href: "/nafir/shura", label: "الشورى", en: "Shura" },
  { href: "/nafir/judiyya", label: "الجودية", en: "Judiyya" },
  { href: "/nafir/canals", label: "الترع", en: "Canals" },
  { href: "/nafir/mine", label: "سجلّ عطائي", en: "My giving" },
  { href: "/nafir/pulse", label: "نبض الثقة", en: "Trust pulse" },
];

export default async function NafirShell({
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
        label={tr(locale, "أقسام النفير", "Nafir sections")}
        moreLabel={tr(locale, "المزيد", "More")}
        active={active}
        tabs={TABS.map((t) => ({ href: t.href, label: tr(locale, t.label, t.en) }))}
      />
      <ActionNotice ok={ok} error={error} />
      {children}
    </div>
  );
}

export { field, button, ghost } from "@/lib/ui";
