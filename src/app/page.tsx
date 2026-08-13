import Link from "next/link";
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
    // Mining lives in its own section — mixing it into the agricultural feed
    // is exactly what confuses a visitor who came for one of the two.
    supabase
      .from("knowledge_entries")
      .select("*")
      .neq("crop", "تعدين")
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
            سودجري مصدر معرفة زراعية موثّقة لأي مزارع يريد تحسين إنتاجه، ومنصة
            استثمار زراعي شفافة قيد البناء للسودانيين في الداخل والمهجر.
          </p>
          <p className="mx-auto mt-4 max-w-2xl rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
            المنصة في مرحلة التطوير.{" "}
            <strong className="font-bold">
              لا توجد مشاريع مطروحة للاستثمار حالياً
            </strong>{" "}
            — ولن نعرض مشروعاً إلا بعد توثيقه قانونياً ومعاينته ميدانياً. أما
            قاعدة المعرفة وحاسبة المياه فتعملان الآن ومتاحتان للجميع مجاناً.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-10">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-primary bg-primary/5 p-5">
            <div className="mb-2 text-3xl">🌾</div>
            <h2 className="mb-1 text-lg font-bold text-primary">الزراعة</h2>
            <p className="text-sm text-muted">
              أنت هنا — معرفة المحاصيل والثروة الحيوانية، وحاسبة المياه، وتخطيط
              المواسم، والاستثمار الزراعي.
            </p>
          </div>
          <Link
            href="/mining"
            className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary"
          >
            <div className="mb-2 text-3xl">⛏️</div>
            <h2 className="mb-1 text-lg font-bold">التعدين</h2>
            <p className="text-sm text-muted">
              قسم منفصل: السلامة في الحفر، والاستخلاص بلا زئبق، وجيولوجيا الذهب
              في السودان.
            </p>
          </Link>
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
              هكذا ستعمل المنصة: مشاريع موثّقة قانونياً ومعاينة ميدانياً، متابعة
              دورية بالتقارير والصور، وحصص تبدأ من مبالغ صغيرة تناسب المموّل
              الصغير والمغترب. سجّل اهتمامك الآن لنبلغك عند فتح باب الاستثمار.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-xl font-bold">المشاريع المتاحة</h2>
        {!projects || projects.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mb-3 text-4xl">🌱</div>
            <h3 className="mb-2 font-bold">لا توجد مشاريع مطروحة بعد</h3>
            <p className="mx-auto max-w-lg text-sm text-muted">
              نحن لا نعرض مشروعاً حتى يكتمل توثيقه: إثبات حيازة الأرض، ومعاينة
              ميدانية، وموافقة الجهة الزراعية. سجّل اهتمامك عبر مساعد سودجري
              وسنبلغك أول ما يُطرح مشروع موثّق.
            </p>
          </div>
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
