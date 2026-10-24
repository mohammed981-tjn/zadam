import { switchSide } from "@/app/side/actions";
import { tr, type Locale } from "@/lib/i18n";

/**
 * «أرضي | استثماري» in the account menu (backlog 151): the two sides of one
 * account, the current one marked, a press on the other moving there. Where
 * the menu used to say «— مستثمر» or «— مزارع», which read as a wall.
 */
export default function SideSwitch({ role, locale }: { role: string | null; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const current = role === "farmer" ? "farmer" : role === "investor" ? "investor" : null;
  const sides = [
    { side: "farmer", label: t("🌾 أرضي", "🌾 My land") },
    { side: "investor", label: t("📈 استثماري", "📈 Investing") },
  ] as const;
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs text-muted">
        {t("حسابك للاثنين: تعرض أرضك وتستثمر.", "Your account does both: offer your land and invest.")}
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-border/50 p-1" role="group" aria-label={t("الجانب", "Side")}>
        {sides.map((s) => {
          const on = current === s.side;
          return (
            <form key={s.side} action={switchSide}>
              <input type="hidden" name="side" value={s.side} />
              <button
                aria-pressed={on}
                className={`w-full rounded-full px-3 py-1.5 text-sm font-bold transition ${
                  on ? "bg-primary text-primary-foreground shadow-card" : "text-foreground hover:bg-card"
                }`}
              >
                {s.label}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
