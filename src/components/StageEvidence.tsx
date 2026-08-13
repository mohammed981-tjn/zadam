"use client";

import EvidenceUpload from "@/components/EvidenceUpload";
import { addEvidence } from "@/app/seasons/actions";

const KINDS = [
  { value: "photo", label: "صورة" },
  { value: "invoice", label: "فاتورة" },
  { value: "inspection", label: "معاينة" },
];

export default function StageEvidence({
  stageId,
  seasonId,
}: {
  stageId: string;
  seasonId: string;
}) {
  return (
    <EvidenceUpload
      kinds={KINDS}
      folder="stages"
      label="ارفع الدليل"
      onUploaded={({ kind, storagePath, caption, metadata }) =>
        addEvidence({ stageId, seasonId, kind, storagePath, caption, metadata })
      }
    />
  );
}
