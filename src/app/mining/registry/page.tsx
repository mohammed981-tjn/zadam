import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EXTRACTION_LABEL, type ExtractionMethod } from "@/lib/provenance";
import RegistryForms from "@/components/RegistryForms";

export const metadata = { title: "سجلّ إثبات المنشأ | سودجري" };

interface SiteRow {
  id: string;
  name: string;
  state: string;
  licensed: boolean;
}

interface LotRow {
  id: string;
  reference: string;
  extracted_on: string;
  method: ExtractionMethod;
  initial_weight_grams: number;
  initial_fineness: number;
  provenance_score: number | null;
  chain_intact: boolean | null;
}

export default async function RegistryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: siteRows }, { data: lotRows }] = await Promise.all([
    supabase.from("mine_sites").select("id, name, state, licensed"),
    supabase
      .from("gold_lots")
      .select(
        "id, reference, extracted_on, method, initial_weight_grams, initial_fineness, provenance_score, chain_intact",
      )
      .order("created_at", { ascending: false }),
  ]);

  const sites = (siteRows ?? []) as SiteRow[];
  const lots = (lotRows ?? []) as LotRow[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">سجلّ إثبات المنشأ</h1>
      <p className="mb-4 mt-2 text-sm text-muted">
        وثّق من أين خرجت الشحنة، وبأي طريقة استُخلصت، وكل يد مرّت عليها. السجل
        يفحص سلسلتك تلقائياً ويخبرك أين الخلل.
      </p>
      <p className="mb-8 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
        <strong className="text-foreground">هذا سجل لا سوق.</strong> لا سعر ولا
        مشترٍ ولا عمولة ولا وساطة — تسجيل معلومات فقط. وحلقات الحيازة لا تُعدَّل
        بعد إضافتها: تُضاف حلقة جديدة ولا يُغيَّر ما مضى، لأن سجلاً قابلاً
        للتعديل لا يُثبت شيئاً.
      </p>

      <RegistryForms sites={sites} />

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">الشحنات ({lots.length})</h2>
        {lots.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted">
            لا توجد شحنات مسجّلة. سجّل موقعاً أولاً ثم شحنة منه.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lots.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/mining/registry/${l.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition hover:border-primary"
                >
                  <div>
                    <p className="font-bold">{l.reference}</p>
                    <p className="text-sm text-muted">
                      {Number(l.initial_weight_grams)} جم · عيار{" "}
                      {Number(l.initial_fineness)} ·{" "}
                      {EXTRACTION_LABEL[l.method]} · {l.extracted_on}
                    </p>
                  </div>
                  <div className="text-left">
                    <p
                      className={`text-xl font-black ${
                        (l.provenance_score ?? 0) >= 75
                          ? "text-primary"
                          : (l.provenance_score ?? 0) >= 45
                            ? "text-accent"
                            : "text-danger"
                      }`}
                    >
                      {l.provenance_score ?? "—"}
                      <span className="text-xs text-muted">/100</span>
                    </p>
                    <p className="text-xs text-muted">
                      {l.chain_intact === false
                        ? "السلسلة مكسورة"
                        : "توثيق المنشأ"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
