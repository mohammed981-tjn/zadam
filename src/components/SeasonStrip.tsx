import Link from "next/link";
import { CROPS, MONTH_NAMES } from "@/lib/agronomy";
import { SCENARIO_CROP_PLAN } from "@/lib/arcCanal";
import { cropName } from "@/lib/enNames";
import { tr, type Locale } from "@/lib/i18n";

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The month in Sudan, not on the server: a page rendered at 23:30 UTC on the
 *  last day of a month is already the next month in Khartoum. */
function sudanMonth(now = new Date()): number {
  const m = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Khartoum", month: "numeric" }).format(now);
  return Number(m) - 1;
}

/**
 * «موسمه الآن» — what is sown this month, and next (backlog 99, the owner's
 * approval of the creative additions).
 *
 * The months are the feasibility study's own crop plan (§8.1, the same table
 * the Arc canal water model reads), not a calendar of our own: on a platform
 * whose claim is that every figure is checkable, a sowing date with no source
 * would be the one unsourced number on the home page. So the strip names its
 * source and links to it, and when the plan sows nothing this month it says
 * what comes next instead of inventing something for now.
 */
export default function SeasonStrip({ locale }: { locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const now = sudanMonth();
  const byMonth = new Map<number, string[]>();
  for (const p of SCENARIO_CROP_PLAN) {
    const crop = CROPS.find((c) => c.key === p.cropKey);
    if (!crop) continue;
    byMonth.set(p.plantingMonth, [...(byMonth.get(p.plantingMonth) ?? []), cropName(crop, locale)]);
  }
  const monthName = (m: number) => (locale === "en" ? MONTHS_EN[m] : MONTH_NAMES[m]);
  const current = byMonth.get(now);
  let next = -1;
  for (let i = 1; i <= 12; i++) {
    if (byMonth.has((now + i) % 12)) {
      next = (now + i) % 12;
      break;
    }
  }
  if (!current && next < 0) return null;
  const sep = locale === "en" ? ", " : "، ";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-card">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose px-2.5 py-0.5 text-xs font-bold text-white">
        {t("موسمه الآن", "In season")}
      </span>
      {current && (
        <span>
          <strong className="font-bold">{monthName(now)}:</strong> {current.join(sep)}
        </span>
      )}
      {next >= 0 && next !== now && (
        <span className="text-muted">
          {current ? "· " : ""}
          {t("ثمّ", "then")} <strong className="font-bold text-foreground">{monthName(next)}:</strong>{" "}
          {byMonth.get(next)!.join(sep)}
        </span>
      )}
      <Link href="/arc-canal" className="ms-auto text-xs text-muted underline-offset-4 hover:text-rose hover:underline">
        {t("من خطة المحاصيل في دراسة الجدوى (§8.1)", "From the feasibility study's crop plan (§8.1)")}
      </Link>
    </div>
  );
}
