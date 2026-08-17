"use client";

import { useRouter } from "next/navigation";
import EvidenceUpload from "@/components/EvidenceUpload";
import { addMilestoneEvidence } from "@/app/contracts/actions";

const KINDS = [
  { value: "photo", label: "صورة من الموقع" },
  { value: "report", label: "تقرير فني" },
  { value: "invoice", label: "فاتورة" },
  { value: "inspection", label: "محضر معاينة" },
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

  return (
    <EvidenceUpload
      kinds={KINDS}
      folder="milestones"
      label="أضف إثبات تنفيذ"
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
