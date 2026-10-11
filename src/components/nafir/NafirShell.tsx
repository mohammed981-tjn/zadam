import Link from "next/link";
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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav aria-label={tr(locale, "أقسام النفير", "Nafir sections")} className="mb-6 flex flex-wrap gap-2">
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
            {tr(locale, t.label, t.en)}
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

export const field =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";
export const button =
  "rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-card transition hover:opacity-90";
export const ghost =
  "rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:border-primary";
