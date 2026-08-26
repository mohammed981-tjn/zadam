import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CROPS } from "@/lib/agronomy";
import PublishRecordToggle from "@/components/PublishRecordToggle";
import type { Season } from "@/types/database";

export const metadata = { title: "مواسمي | سودجري" };

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("seasons")
    .select("*")
    .order("planting_date", { ascending: false });

  const seasons = (data ?? []) as Season[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">مواسمي</h1>
          <p className="mt-1 text-sm text-muted">
            كل موسم يُسجَّل هنا يبني سجلك كمنفّذ — وهو ما يقرأه محرّك التقييم.
          </p>
        </div>
        <Link
          href="/seasons/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          موسم جديد
        </Link>
      </div>

      {errorMessage && (
        <p className="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {errorMessage}
        </p>
      )}

      {/* Placed above the list on purpose: the choice is made while looking at
          exactly what it would publish. */}
      <PublishRecordToggle seasonCount={seasons.length} />

      {seasons.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted">
          لم تسجّل موسماً بعد. ابدأ بموسم واحد — حتى لو كان قد بدأ فعلاً — وسجّل
          مراحله ومصروفاته لتعرف ربح الفدان الحقيقي في نهايته.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {seasons.map((s) => {
            const crop =
              CROPS.find((c) => c.key === s.crop_key)?.name ?? s.crop_key;
            return (
              <li key={s.id}>
                <Link
                  href={`/seasons/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition hover:border-primary"
                >
                  <div>
                    <h2 className="font-bold">{s.name}</h2>
                    <p className="text-sm text-muted">
                      {crop} · {s.feddans} فدان
                      {s.location ? ` · ${s.location}` : ""}
                    </p>
                  </div>
                  <div className="text-left text-sm">
                    <p className="text-muted">{s.planting_date}</p>
                    <span
                      className={`text-xs font-medium ${
                        s.status === "completed"
                          ? "text-primary"
                          : "text-accent"
                      }`}
                    >
                      {s.status === "completed"
                        ? "مكتمل"
                        : s.status === "abandoned"
                          ? "متوقف"
                          : "جارٍ"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
