"use client";

import { useRouter } from "next/navigation";
import EvidenceUpload from "@/components/EvidenceUpload";
import { addMilestoneEvidence } from "@/app/contracts/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

const KINDS = [
  { value: "photo", label: "صورة من الموقع", labelEn: "Photo from the site" },
  { value: "report", label: "تقرير فني", labelEn: "Technical report" },
  { value: "invoice", label: "فاتورة", labelEn: "Invoice" },
  { value: "inspection", label: "محضر معاينة", labelEn: "Inspection record" },
];

/**
 * Attaching proof to a contract phase.
 *
 * A thin wrapper over the same uploader the season stages use, on purpose: a
 * field agent who has photographed one stage already knows how this works, and
 * a second upload widget with its own quirks would be a second thing to learn
 * for no gain.
 */
export default function MilestoneProof({
  milestoneId,
  contractId,
}: {
  milestoneId: string;
  contractId: string;
}) {
  const router = useRouter();
  const locale = useLocale();

  return (
    <EvidenceUpload
      kinds={KINDS.map((k) => ({
        value: k.value,
        label: locale === "en" ? k.labelEn : k.label,
      }))}
      folder="milestones"
      label={tr(locale, "أضف إثبات تنفيذ", "Add proof of delivery")}
      onUploaded={async ({ kind, storagePath, caption, metadata }) => {
        const result = await addMilestoneEvidence({
          milestoneId,
          contractId,
          kind,
          storagePath,
          caption,
          metadata,
        });
        // The approve button unlocks only once proof exists, so the page has to
        // reflect the new file immediately rather than after a manual reload.
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
