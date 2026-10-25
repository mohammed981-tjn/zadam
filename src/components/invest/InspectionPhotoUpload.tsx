"use client";

import { useRouter } from "next/navigation";
import EvidenceUpload from "@/components/EvidenceUpload";
import { addInspectionPhoto } from "@/app/invest/inspections/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

/**
 * The inspector's photos (backlog 128). The file goes from the phone straight
 * to the inspector's own folder in the evidence bucket; the action records it
 * against the inspection with the date and place the camera wrote, and the page
 * is refreshed so the photo appears in the list above.
 */
export default function InspectionPhotoUpload({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <EvidenceUpload
      kinds={[{ value: "photo", label: t("صورة من الأرض", "Photo from the land") }]}
      folder="inspections"
      label={t("أضف صورة", "Add a photo")}
      offline={{ key: `inspection:${inspectionId}`, label: t("صورة معاينة", "Inspection photo") }}
      onUploaded={async ({ storagePath, caption, metadata }) => {
        const result = await addInspectionPhoto({ inspectionId, storagePath, caption, metadata });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
