"use client";

import EvidenceUpload from "@/components/EvidenceUpload";
import { addEvidence } from "@/app/seasons/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

const KINDS = [
  { value: "photo", label: "صورة", en: "Photo" },
  { value: "invoice", label: "فاتورة", en: "Invoice" },
  { value: "inspection", label: "معاينة", en: "Inspection" },
];

export default function StageEvidence({
  stageId,
  seasonId,
}: {
  stageId: string;
  seasonId: string;
}) {
  const locale = useLocale();
  const kinds = KINDS.map((k) => ({
    value: k.value,
    label: tr(locale, k.label, k.en),
  }));

  return (
    <EvidenceUpload
      kinds={kinds}
      folder="stages"
      label={tr(locale, "ارفع الدليل", "Upload evidence")}
      offline={{ key: `stage:${stageId}`, label: tr(locale, "دليل مرحلة", "Stage evidence") }}
      onUploaded={({ kind, storagePath, caption, metadata }) =>
        addEvidence({ stageId, seasonId, kind, storagePath, caption, metadata })
      }
    />
  );
}
