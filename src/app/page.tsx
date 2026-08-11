import { createClient } from "@/lib/supabase/server";
import ProjectCard from "@/components/ProjectCard";
import KnowledgeCard from "@/components/KnowledgeCard";
import type { KnowledgeEntry, Project } from "@/types/database";

export default async function Home() {
  const supabase = await createClient();

  const [{ data: projects }, { data: knowledge }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase
      .from("knowledge_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return (
    <div>
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h1 className="mx-auto max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
            منصة تخدم كل مزارع ومستثمر سوداني
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            سودجري ليست فقط لعرض فرص استثمارية — هي مصدر معرفة زراعية موثّقة لأي
            مزارع يريد تحسين إنتاجه، ومنصة استثمار شفافة لأي شخص يريد ضخ رأس مال
            في مشاريع زراعية حقيقية موثّقة قانونياً، داخل السودان أو من
            المغتربين.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-2 text-3xl">🌾</div>
            <h2 className="mb-2 text-lg font-bold">للمزارعين</h2>
            <p className="text-sm text-muted">
              اسأل مساعد سودجري الذكي 💬 عن أي محصول أو ماشية — تربة، ري، آفات،
              أصناف. قاعدة معرفة موثّقة مبنية على تجارب دول رائدة زراعياً، مع
              تنبيه دائم متى تحتاج المعلومة تحققاً محلياً قبل تطبيقها.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-2 text-3xl">💰</div>
            <h2 className="mb-2 text-lg font-bold">للمستثمرين</h2>
            <p className="text-sm text-muted">
              تصفّح مشاريع استصلاح وزراعة موثّقة قانونياً، مع متابعة ميدانية
              دورية، وحصص استثمار تبدأ من مبالغ صغيرة تناسب صغار المموّلين
              والمغتربين على حد سواء.
            </p>
          </div>
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

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">قاعدة المعرفة الزراعية</h2>
          <p className="text-sm text-muted">
            اسأل المساعد 💬 لمزيد من التفاصيل عن أي محصول
          </p>
        </div>
        {!knowledge || knowledge.length === 0 ? (
          <p className="text-muted">قاعدة المعرفة قيد الإعداد حالياً.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(knowledge as KnowledgeEntry[]).map((entry) => (
              <KnowledgeCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
