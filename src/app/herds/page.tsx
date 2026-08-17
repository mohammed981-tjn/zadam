import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/Explain";
import { SPECIES_LABEL, PURPOSE_LABEL } from "@/lib/livestock";
import type { Herd } from "@/types/database";

export const metadata = { title: "دورات الإنتاج الحيواني | سودجري" };

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default async function HerdsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("herds")
    .select("*")
    .order("start_date", { ascending: false });

  const herds = (rows ?? []) as Herd[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">دورات الإنتاج الحيواني</h1>
          <p className="mt-1 text-sm text-muted">
            كل دورة مقسّمة إلى مراحل بتواريخها وتقدير علفها، ويمكن التعاقد على
            خدماتها البيطرية والتغذوية بالمراحل.
          </p>
        </div>
        <Link
          href="/herds/new"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          دورة جديدة
        </Link>
      </div>

      {herds.length === 0 ? (
        <EmptyState
          title="لا توجد دورات بعد"
          action={
            <Link
              href="/herds/new"
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              أنشئ أول دورة
            </Link>
          }
        >
          الدورة هي ما يقابل الموسم في الجانب الحيواني: قطيع له بداية ونهاية،
          ومراحل من الاقتناء والحجر الصحي حتى التسويق، لكل مرحلة تاريخ وميزانية.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {herds.map((h) => (
            <li key={h.id}>
              <Link
                href={`/herds/${h.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50"
              >
                <span>
                  <span className="font-medium">{h.name}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {SPECIES_LABEL[h.species]} — {PURPOSE_LABEL[h.purpose]}
                    {h.breed && ` — ${h.breed}`}
                  </span>
                </span>
                <span className="text-sm font-bold">
                  {n0(h.head_count)} رأس
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
