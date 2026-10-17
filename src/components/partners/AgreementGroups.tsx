import { tr, type Locale } from "@/lib/i18n";
import { stateName } from "@/lib/nafir";
import { cropName, waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import { SERVICE_BY_KEY, type ServiceKey } from "@/lib/services";
import { AREA_BAND_SHORT, lbl, type AreaBand, type PartnerAgreement } from "@/lib/partners";

/**
 * The group an agreement serves, one line per dimension. An empty dimension
 * reads «أيّاً كان» — the table's own meaning — rather than being left out,
 * so a reader can tell "any soil" from "soil not mentioned".
 */
export default function AgreementGroups({ a, locale }: { a: PartnerAgreement; locale: Locale }) {
  const any = tr(locale, "أيّاً كان", "Any");
  const list = (xs: string[], f: (x: string) => string) => (xs.length === 0 ? any : xs.map(f).join(locale === "en" ? ", " : "، "));
  const rows: [string, string][] = [
    [tr(locale, "الولايات", "States"), list(a.states, (s) => stateName(s, locale))],
    [tr(locale, "مصدر الماء", "Water"), list(a.water_sources, (w) => waterSourceLabel(w, locale))],
    [tr(locale, "التربة", "Soil"), list(a.soil_classes, (s) => (locale === "en" ? wrbShortEn(s) : wrbShort(s)))],
    [tr(locale, "المساحة", "Area"), list(a.area_bands, (b) => (AREA_BAND_SHORT[b as AreaBand] ? lbl(AREA_BAND_SHORT[b as AreaBand], locale) : b))],
    [tr(locale, "المحاصيل", "Crops"), list(a.crop_keys, (c) => cropName(c, locale))],
    [
      tr(locale, "الخدمات", "Services"),
      list(a.services, (k) => {
        const s = SERVICE_BY_KEY[k as ServiceKey];
        return s ? (locale === "en" ? s.nameEn : s.name) : k;
      }),
    ],
  ];
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
