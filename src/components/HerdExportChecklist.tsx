import Link from "next/link";
import { tr, type Locale } from "@/lib/i18n";
import {
  DESTINATION_NAME,
  EXPORT_DESTINATIONS,
  SOURCE_KIND_LABEL,
  checklistVerdict,
  type CheckLine,
  type CheckStatus,
  type ExportDestination,
} from "@/lib/livestockExportChecklist";

const MARK: Record<CheckStatus, { sign: string; className: string }> = {
  ok: { sign: "✓", className: "text-primary" },
  missing: { sign: "✗", className: "text-danger" },
  warn: { sign: "⚠", className: "text-accent" },
  info: { sign: "ℹ", className: "text-muted" },
};

/**
 * «قائمة التحضير» for one destination: what Sudan and the importing country
 * ask, each line with its source, checked against the herd's own record where
 * the record can answer. The verdict is «مستوفٍ لقائمة التحضير», never
 * «جاهز للتصدير» — the quarantine and the importing port decide that.
 */
export default function HerdExportChecklist({
  herdId,
  destination,
  lines,
  locale,
}: {
  herdId: string;
  destination: ExportDestination;
  lines: CheckLine[];
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const v = checklistVerdict(lines);

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{t("قائمة التحضير — الوجهة:", "Preparation checklist — destination:")}</span>
        {EXPORT_DESTINATIONS.map((d) => (
          <Link
            key={d}
            href={`/herds/${herdId}?to=${d}#readiness`}
            className={`rounded-full border px-3 py-0.5 ${d === destination ? "border-primary bg-primary/10 font-medium text-primary" : "border-border"}`}
          >
            {en ? DESTINATION_NAME[d].en : DESTINATION_NAME[d].ar}
          </Link>
        ))}
      </div>

      <p className={`mt-2 text-sm font-medium ${v.met ? "text-primary" : ""}`}>
        {v.met
          ? t("مستوفٍ لقائمة التحضير فيما يسجّله القطيع. والقرار للمحجر وبلد الوصول.", "Meets the preparation checklist as far as the herd's record goes. The quarantine and the destination decide.")
          : t(
              `ينقص سجلَّ القطيع ${v.missing} وفي ${v.warn} تنبيه — راجعها قبل البيع للمصدّر.`,
              `The herd's record is missing ${v.missing} and has ${v.warn} warnings — check them before selling to the exporter.`,
            )}
      </p>

      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start gap-2">
            <span aria-hidden className={`mt-0.5 ${MARK[l.status].className}`}>
              {MARK[l.status].sign}
            </span>
            <span>
              <span className="font-medium">{en ? l.en : l.ar}</span>
              <span className="block text-xs leading-relaxed">{en ? l.detailEn : l.detailAr}</span>
              <span className="block text-[11px] text-muted">
                {t("المصدر: ", "Source: ")}
                <a href={l.source.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {l.source.label}
                </a>{" "}
                ({en ? SOURCE_KIND_LABEL[l.source.kind].en : SOURCE_KIND_LABEL[l.source.kind].ar}
                {l.source.date !== "undated" ? ` · ${l.source.date}` : t(" · بلا تاريخ", " · undated")}
                {!l.source.current && t(" · قديم، تحقّق منه", " · older, check it")})
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {t(
          "هذه قائمة تحضير، لا شهادة: لا تقول إنّ الحيوان سليم ولا إنّه مقبول. الفحص والشهادة للمحجر البيطريّ، والقبول لبلد الوصول عند ميناءه — ويرفض الإرساليّة كلّها إن وجد مرضاً في رأسٍ واحد.",
          "This is a preparation checklist, not a certificate: it does not say an animal is healthy or will be accepted. Inspection and the certificate are the veterinary quarantine's; acceptance is the destination's, at its port — and it rejects a whole consignment for disease in one head.",
        )}
      </p>
    </div>
  );
}
