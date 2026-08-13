import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATIONS } from "@/lib/agronomy";
import { WATER_SOURCE_LABEL, type WaterSource } from "@/lib/risk";
import type { Land } from "@/types/database";

export const metadata = { title: "أراضيّ | سودجري" };

const VERIFICATION_LABEL: Record<Land["verification"], string> = {
  unverified: "غير محقّقة",
  submitted: "قيد المراجعة",
  verified: "محقّقة",
  rejected: "مرفوضة",
};

export default async function LandsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("lands")
    .select("*")
    .order("created_at", { ascending: false });

  const lands = (data ?? []) as Land[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">أراضيّ</h1>
          <p className="mt-1 text-sm text-muted">
            أرضك المسجّلة هي أساس كل موسم وكل فرصة تعرضها لاحقاً.
          </p>
        </div>
        <Link
          href="/lands/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          سجّل أرضاً
        </Link>
      </div>

      {lands.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted">
          لم تسجّل أرضاً بعد. ابدأ بأرض واحدة — التسجيل مجاني ولا يظهر لأحد حتى
          تعتمده الإدارة.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {lands.map((l) => {
            const station =
              STATIONS.find((s) => s.key === l.station_key)?.name ??
              l.station_key;
            return (
              <li
                key={l.id}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold">{l.name}</h2>
                    <p className="text-sm text-muted">
                      {l.state}
                      {l.locality ? ` · ${l.locality}` : ""} · {l.feddans} فدان
                      · {station}
                    </p>
                  </div>
                  <div className="text-left">
                    <span
                      className={`text-xs font-medium ${
                        l.verification === "verified"
                          ? "text-primary"
                          : l.verification === "rejected"
                            ? "text-danger"
                            : "text-accent"
                      }`}
                    >
                      {VERIFICATION_LABEL[l.verification]}
                    </span>
                    <p className="text-xs text-muted">
                      التوثيق {l.documents_on_file}/{l.documents_required}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {[
                    [
                      "مصدر المياه",
                      WATER_SOURCE_LABEL[l.water_source as WaterSource] ??
                        l.water_source,
                    ],
                    [
                      "المياه للفدان",
                      l.water_per_feddan
                        ? `${Math.round(Number(l.water_per_feddan)).toLocaleString("en-US")} م³`
                        : "—",
                    ],
                    ["التربة", l.soil_note ?? "—"],
                    ["زُرع سابقاً", l.previous_crops ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>

                {l.verification_note && (
                  <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted">
                    {l.verification_note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
