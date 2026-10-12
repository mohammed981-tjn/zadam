import Link from "next/link";
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
      <nav aria-label={tr(locale, "أقسام المدخلات", "Inputs sections")} className="mb-6 flex flex-wrap gap-2">
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

export const field =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base focus:border-primary focus:outline-none sm:text-sm";
export const button =
  "rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-card transition hover:opacity-90 disabled:opacity-50";
export const ghost =
  "rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:border-primary";
export const card = "rounded-2xl border border-border bg-card p-4 sm:p-5";
