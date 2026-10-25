"use client";

import { useRouter } from "next/navigation";
import EvidenceUpload from "@/components/EvidenceUpload";
import { attachToConversation } from "@/app/messages/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

/**
 * A photo or a document in a conversation (backlog 144). The file goes from the
 * phone straight to the sender's own folder in the evidence bucket, as land
 * documents and inspection photos do; the action then sends it as a message,
 * and the page is refreshed so it appears in the thread.
 */
export default function MessageAttachment({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <EvidenceUpload
      kinds={[
        { value: "photo", label: t("صورة", "Photo") },
        { value: "document", label: t("مستند (PDF)", "Document (PDF)") },
      ]}
      folder="messages"
      label={t("📎 أرفق صورةً أو مستنداً", "📎 Attach a photo or a document")}
      offline={{ key: `message:${conversationId}`, label: t("مرفق رسالة", "Message attachment") }}
      onUploaded={async ({ kind, storagePath, caption }) => {
        const result = await attachToConversation({ conversationId, storagePath, caption, kind });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
