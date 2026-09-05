import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/types/database";

export const metadata = {
  title: "المشاريع المطروحة · سودجري",
  description:
    "المشاريع الزراعية المطروحة للاستثمار في السودان — ولا يُعرض مشروع قبل توثيق حيازته ومعاينته ميدانياً.",
};

/**
 * فهرسُ المشاريع — والمسارُ الوحيد إلى جواز المزرعة.
 *
 * WHY ITS ABSENCE MATTERED MORE THAN IT LOOKS
 *
 * `src/app/projects/` held only `[slug]`, so `/projects` was a 404. That alone
 * is a broken route. The larger cost is what it cut off: `/farmers/[id]` — the
 * farm passport — is linked from exactly one place in the entire application,
 * the project detail page. With no index, a visitor could reach a project only
 * by being handed its slug, and could reach a passport only through that.
 *
 * So the trust layer this platform spent a phase building had no navigable path
 * to it at all. Building the index restores the chain: fهرس → مشروع → جواز.
 *
 * وحالةُ اليوم تُقال كما هي
 *
 * Every project in the database is `draft`, so this page is honestly empty
 * right now — and it says so in the words the home page uses, because a visitor
 * who reads «لا توجد مشاريع» in two different phrasings on two pages learns
 * only that the site is inconsistent.
 */
export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    // نفسُ مِصفاة الصفحة الأولى: المسوّدةُ ليست عرضاً، وعرضُها هنا وحدها كان
    // سيجعل الفهرسَ يناقض الصفحةَ التي يُكمّلها.
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("projects: read failed", error);
  }

  const projects = (data ?? []) as Project[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">المشاريع المطروحة</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
        كلُّ مشروعٍ هنا مرّ بتوثيق حيازة الأرض ومعاينةٍ ميدانية قبل أن يُعرض.
        وما تشهد به المنصّة هو <strong>أنّ ما يقوله المشروع مسنودٌ بأوراق</strong>{" "}
        — لا أنّ الموسم سيربح. تلك تبقى مخاطرةً تخصّك، وفي صفحة كلّ مشروع
        تفصيلُها ودرجةُ مخاطرته.
      </p>

      {error ? (
        <p className="mt-8 rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm leading-relaxed">
          تعذّر قراءة المشاريع الآن — <strong>والخلل عندنا</strong>، لا أنّه لا
          مشاريع. أعد المحاولة بعد قليل.
        </p>
      ) : projects.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center">
          <h2 className="mb-2 font-bold">لا توجد مشاريع مطروحة بعد</h2>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
            لا يُعرض مشروع حتى يكتمل توثيقه: إثبات حيازة الأرض، ومعاينة ميدانية،
            وموافقة الجهة الزراعية.{" "}
            <Link href="/feedback" className="text-primary underline">
              سجّل اهتمامك
            </Link>{" "}
            وسنبلغك أوّل ما يُطرح مشروع موثّق.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
