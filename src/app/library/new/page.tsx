import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ResearchForm from "@/components/ResearchForm";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "شارك دراستك | سوداقري", "Share your study | Sudagri") };
}

/** «شارك دراستك أو بحثك» (البند ٢٠٢): لأيّ أحد، زائراً أو مسجَّلاً؛ ولا يُنشر شيءٌ بإرساله. */
export default async function LibraryNewPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/library" className="text-sm text-primary underline">
        {t("→ مكتبة الدراسات والبحوث", "← Studies and research library")}
      </Link>
      <div className="mt-4">
        <PageHeader icon="book" title={t("شارك دراستك أو بحثك", "Share your study or research")}>
          {t(
            "دراسة جدوى، أو بحثٌ علميّ، أو رسالةٌ جامعيّة، أو تقريرٌ عن الزراعة في السودان — بلا حساب إن شئت. تراجعه الإدارة قبل نشره، وينشر باسم مؤلّفيه، ولا تُنشر وسيلة تواصلك.",
            "A feasibility study, research paper, thesis or report on farming in Sudan — with no account if you prefer. The team reviews it before publication; it is published under its authors' names, and your contact details never are.",
          )}
        </PageHeader>
      </div>
      <div className="mt-6">
        <ResearchForm />
      </div>
    </div>
  );
}
