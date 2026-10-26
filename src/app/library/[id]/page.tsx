import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { RESEARCH_KIND_LABEL, type ResearchKind } from "@/lib/research";

type Item = {
  id: string;
  kind: ResearchKind;
  title: string;
  authors: string;
  institution: string | null;
  year: number | null;
  language: "ar" | "en" | "other";
  crop: string | null;
  state: string | null;
  abstract: string;
  file_path: string | null;
  link_url: string | null;
  published_at: string;
};

const COLUMNS = "id, kind, title, authors, institution, year, language, crop, state, abstract, file_path, link_url, published_at";

async function load(id: string): Promise<Item | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  // The table answers only a published work, whoever asks.
  const { data } = await supabase.from("research_items").select(COLUMNS).eq("id", id).eq("status", "published").maybeSingle();
  return (data as Item | null) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/library/[id]">) {
  const item = await load((await params).id);
  return item ? { title: `${item.title} | سوداقري`, description: item.abstract.slice(0, 160) } : {};
}

/**
 * عملٌ منشور في المكتبة (البند ٢٠٢): ملخّصه ومن كتبه، والملفّ برابطٍ موقَّعٍ لساعة، أو رابطه، وطريقة الاستشهاد به.
 *
 * The bucket is private; a signed link is made here, for a work the table has just said is published, and lasts an
 * hour. The service key makes it (caller 5 in lib/supabase/admin.ts) because no reader holds a storage policy.
 */
export default async function LibraryItemPage({ params }: PageProps<"/library/[id]">) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const item = await load((await params).id);
  if (!item) notFound();

  let fileUrl: string | null = null;
  if (item.file_path) {
    const admin = createAdminClient();
    const { data } = admin ? await admin.storage.from("research").createSignedUrl(item.file_path, 3600) : { data: null };
    fileUrl = data?.signedUrl ?? null;
  }
  const published = new Date(item.published_at).toLocaleDateString(locale === "en" ? "en-GB" : "ar-SD", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const cite = `${item.authors}${item.year ? ` (${item.year})` : ""}. ${item.title}.${item.institution ? ` ${item.institution}.` : ""} ${t("مكتبة سوداقري", "Sudagri library")}.`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/library" className="text-sm text-primary underline">
        {t("→ مكتبة الدراسات والبحوث", "← Studies and research library")}
      </Link>
      <p className="mt-6 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">{tr(locale, ...RESEARCH_KIND_LABEL[item.kind])}</span>
        {item.crop && <span className="rounded-full bg-card px-2.5 py-0.5 text-muted">{item.crop}</span>}
        {item.state && <span className="rounded-full bg-card px-2.5 py-0.5 text-muted">{item.state}</span>}
      </p>
      <h1 className="mt-3 font-black leading-tight" style={{ fontSize: "var(--text-title)" }}>
        {item.title}
      </h1>
      <p className="mt-2 text-muted">
        {item.authors}
        {item.institution && ` · ${item.institution}`}
        {item.year && ` · ${item.year}`}
      </p>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold">{t("الملخّص", "Abstract")}</h2>
        <p className="mt-2 whitespace-pre-line leading-8">{item.abstract}</p>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
            {t("افتح الملفّ (PDF)", "Open the file (PDF)")}
          </a>
        )}
        {item.link_url && (
          <a href={item.link_url} target="_blank" rel="noopener nofollow" className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold">
            {t("افتح العمل في موقعه", "Open the work where it is published")}
          </a>
        )}
      </div>

      <section className="mt-8 text-sm text-muted">
        <p>
          {t("نُشر في المكتبة: ", "Published in the library: ")}
          {published}
        </p>
        <p className="mt-2">{t("استشهد به هكذا:", "Cite it as:")}</p>
        <p className="mt-1 rounded-xl bg-card p-3 text-foreground">{cite}</p>
        <p className="mt-4">
          {t(
            "ما يُنشر هنا كتبه أصحابه، وراجعت سوداقري أنّه عن الزراعة في السودان وأنّ مرسِله أقرّ بحقّه في مشاركته؛ والرأي فيه لأصحابه.",
            "What is published here was written by its authors; Sudagri checked that it concerns farming in Sudan and that its sender confirmed the right to share it. The views in it are its authors'.",
          )}
        </p>
      </section>
    </div>
  );
}
