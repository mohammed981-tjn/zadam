import type { Locale } from "@/lib/i18n";
import { tr } from "@/lib/i18n";
import {
  CATEGORY_LABEL,
  PACK_UNIT_LABEL,
  dateLabel,
  lbl,
  num,
  sdg,
  today,
  usd,
  type SupplierProduct,
} from "@/lib/supplyChain";

/**
 * One offer: the dollar price the supplier set, until the date they set, and
 * the same in pounds at today's bank rate — labelled as the supplier's offer,
 * never as a market price.
 */
export default function ProductRow({
  p,
  locale,
  rate,
}: {
  p: SupplierProduct;
  locale: Locale;
  rate: number | null;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const expired = p.valid_until < today();
  const typed = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};
  return (
    <li className="flex flex-col gap-1 border-t border-border py-3 first:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="font-medium" {...typed}>
          {p.name}
        </p>
        <p className="text-xs text-muted">
          {lbl(CATEGORY_LABEL[p.category], locale)}
          {p.active_ingredient && (
            <>
              {" · "}
              <bdi>{p.active_ingredient}</bdi>
            </>
          )}
          {" · "}
          {num(p.pack_size, locale, 3)} {lbl(PACK_UNIT_LABEL[p.pack_unit], locale)}
        </p>
        {p.registration_no && (
          <p className="text-xs">
            {p.category === "seed" ? t("الصنف المعتمد:", "Approved variety:") : t("رقم التسجيل:", "Registration no.:")}{" "}
            <bdi className="figure font-medium">{p.registration_no}</bdi>
            {p.cert_lot && (
              <>
                {" · "}
                {t("لوط الإكثار:", "Certified lot:")} <bdi className="figure">{p.cert_lot}</bdi>
              </>
            )}
          </p>
        )}
      </div>
      <div className={`shrink-0 text-start sm:text-end ${expired ? "opacity-60" : ""}`}>
        <p className="figure text-lg font-bold">{usd(p.price_usd, locale)}</p>
        {rate && <p className="figure text-xs text-muted">≈ {sdg(p.price_usd * rate, locale)}</p>}
        <p className={`text-xs ${expired ? "text-danger" : "text-muted"}`}>
          {expired
            ? t(`انتهى العرض في ${dateLabel(p.valid_until, locale)} — اسأل المورد عن سعره اليوم`, `Offer ended ${dateLabel(p.valid_until, locale)} — ask the supplier for today’s price`)
            : t(`العرض سارٍ حتى ${dateLabel(p.valid_until, locale)}`, `Offer valid until ${dateLabel(p.valid_until, locale)}`)}
        </p>
      </div>
    </li>
  );
}
