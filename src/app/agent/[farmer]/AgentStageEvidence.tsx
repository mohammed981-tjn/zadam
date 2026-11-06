"use client";

import EvidenceUpload from "@/components/EvidenceUpload";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { agentAddEvidence } from "./actions";

const KINDS = [
  { value: "photo", label: "صورة", en: "Photo" },
  { value: "invoice", label: "فاتورة", en: "Invoice" },
  { value: "inspection", label: "معاينة", en: "Inspection" },
];

/**
 * دليلٌ يرفعه الوكيل على مرحلةٍ من موسم المزارع. الملفّ إلى مجلّد الوكيل نفسه (سياسة الدلو: أوّل المسار هو الرافع)،
 * ثمّ يُسجَّل على المرحلة معلَّماً بإذنه. بلا حفظٍ في الجهاز حين ينقطع الاتصال: صندوق الإرسال للمزارع في موسمه.
 */
export default function AgentStageEvidence({ farmer, stageId }: { farmer: string; stageId: string }) {
  const locale = useLocale();
  return (
    <EvidenceUpload
      kinds={KINDS.map((k) => ({ value: k.value, label: tr(locale, k.label, k.en) }))}
      folder="stages"
      label={tr(locale, "ارفع دليلاً باسمه", "Upload evidence in their name")}
      onUploaded={({ kind, storagePath, caption, metadata }) =>
        agentAddEvidence({ farmer, stageId, kind, storagePath, caption, metadata })
      }
    />
  );
}
