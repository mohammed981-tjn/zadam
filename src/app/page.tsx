import { createClient } from "@/lib/supabase/server";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/types/database";

export default async function Home() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  return (
    <div>
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h1 className="mx-auto max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
            استثمر في استصلاح وزراعة أراضٍ حقيقية في السودان
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            مشاريع زراعية موثّقة قانونياً، متابعة ميدانية دورية وصور أقمار صناعية،
            وحصص استثمار تبدأ من مبالغ صغيرة — لأي مستثمر داخل السودان أو من المغتربين.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-xl font-bold">المشاريع المتاحة</h2>
        {!projects || projects.length === 0 ? (
          <p className="text-muted">لا توجد مشاريع منشورة حالياً.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(projects as Project[]).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
