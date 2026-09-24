import Link from "next/link";

/**
 * The frame every /nafir page shares: the section's tabs and the one-line
 * result of the last action (?ok= / ?error=), so a form that redirected back
 * says what happened where the person is looking.
 */
const TABS = [
  { href: "/nafir", label: "الساحة" },
  { href: "/nafir/charter", label: "الميثاق" },
  { href: "/nafir/faza", label: "الفزعة" },
  { href: "/nafir/shura", label: "الشورى" },
  { href: "/nafir/judiyya", label: "الجودية" },
  { href: "/nafir/canals", label: "الترع" },
  { href: "/nafir/mine", label: "سجلّ عطائي" },
  { href: "/nafir/pulse", label: "نبض الثقة" },
];

export default function NafirShell({
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
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav aria-label="أقسام النفير" className="mb-6 flex flex-wrap gap-2">
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
            {t.label}
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
