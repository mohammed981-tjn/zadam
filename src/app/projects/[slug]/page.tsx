import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd, riskLabel, statusLabel } from "@/lib/format";
import type { Project, ProjectUpdate } from "@/types/database";
import { invest } from "./actions";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const typedProject = project as Project;

  const { data: updates } = await supabase
    .from("project_updates")
    .select("*")
    .eq("project_id", typedProject.id)
    .order("created_at", { ascending: false });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fundedPct = Math.min(
    100,
    Math.round((typedProject.shares_sold / typedProject.total_shares) * 100),
  );
  const remainingShares = typedProject.total_shares - typedProject.shares_sold;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm text-muted">{typedProject.location}</p>
      <h1 className="mt-1 text-3xl font-black">{typedProject.name}</h1>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
          {statusLabel(typedProject.status)}
        </span>
        <span className="rounded-full bg-border/60 px-3 py-1">
          مخاطرة {riskLabel(typedProject.risk_level)}
        </span>
        <span className="rounded-full bg-border/60 px-3 py-1">
          {typedProject.total_feddans} فدان
        </span>
        {typedProject.expected_annual_return && (
          <span className="rounded-full bg-border/60 px-3 py-1">
            عائد سنوي متوقع {typedProject.expected_annual_return}%
          </span>
        )}
      </div>

      {typedProject.description && (
        <p className="mt-6 leading-relaxed text-foreground/90">{typedProject.description}</p>
      )}

      <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-4 text-lg font-bold">آخر التقارير الميدانية</h2>
          {!updates || updates.length === 0 ? (
            <p className="text-sm text-muted">لا توجد تقارير منشورة بعد لهذا المشروع.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {(updates as ProjectUpdate[]).map((update) => (
                <li key={update.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{update.title}</h3>
                    <time className="text-xs text-muted">
                      {new Date(update.created_at).toLocaleDateString("ar-EG")}
                    </time>
                  </div>
                  {update.body && (
                    <p className="mt-2 text-sm text-foreground/80">{update.body}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full bg-primary" style={{ width: `${fundedPct}%` }} />
          </div>
          <p className="mb-4 text-sm text-muted">
            {fundedPct}% ممول · متبقي {remainingShares} حصة من أصل {typedProject.total_shares}
          </p>

          {error && (
            <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {typedProject.status === "open" ? (
            <form action={invest} className="flex flex-col gap-3">
              <input type="hidden" name="project_id" value={typedProject.id} />
              <input type="hidden" name="slug" value={typedProject.slug} />
              <input type="hidden" name="price_per_share" value={typedProject.price_per_share} />
              <label className="flex flex-col gap-1 text-sm">
                عدد الحصص (سعر الحصة {formatUsd(typedProject.price_per_share)})
                <input
                  type="number"
                  name="shares"
                  min={1}
                  max={remainingShares}
                  defaultValue={1}
                  required
                  className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
              >
                استثمر الآن
              </button>
              {!user && (
                <p className="text-xs text-muted">سيُطلب منك تسجيل الدخول أولاً.</p>
              )}
            </form>
          ) : (
            <p className="text-sm text-muted">هذا المشروع غير متاح للاستثمار حالياً.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
