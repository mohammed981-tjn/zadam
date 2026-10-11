import { COUNTRIES } from "@/lib/phone";
import { tr, type Locale } from "@/lib/i18n";

/**
 * Country code beside the number, Sudan preselected.
 *
 * inputMode="numeric" so a phone shows the number pad rather than the full
 * keyboard, and type="tel" rather than type="number" — a number input strips
 * leading zeros in some browsers, which is precisely the digit a Sudanese
 * visitor types first.
 */
export default function PhoneField({
  defaultDial = "249",
  autoFocus = false,
  locale = "ar",
}: {
  defaultDial?: string;
  autoFocus?: boolean;
  locale?: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const field =
    "rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary";

  return (
    <label className="flex flex-col gap-1 text-sm">
      {t("رقم الجوال", "Mobile number")}
      <div className="flex gap-2" dir="ltr">
        <select
          name="dial_code"
          defaultValue={defaultDial}
          aria-label={t("مفتاح الدولة", "Country code")}
          className={`${field} w-32 shrink-0`}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.dial}>
              +{c.dial} {locale === "en" ? c.nameEn : c.name}
            </option>
          ))}
        </select>

        <input
          type="tel"
          name="phone"
          inputMode="numeric"
          autoComplete="tel-national"
          required
          autoFocus={autoFocus}
          placeholder="0912345678"
          className={`${field} min-w-0 flex-1`}
        />
      </div>
      <span className="text-xs text-muted">
        {t(
          "اكتب رقمك كما تكتبه عادةً — الصفر في أوله لا يهم.",
          "Type your number the way you usually write it — a leading zero doesn't matter.",
        )}
      </span>
    </label>
  );
}
