import Link from "next/link";
import NafirShell, { button } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { FAZA_CAUSES, FAZA_NEEDS, ageAr, type FazaRequest } from "@/lib/nafir";

export const metadata = {
  title: "الفزعة | سوداغري",
  description: "مَن أصابته جائحةٌ في زرعه أو ماشيته يطلب عوناً — يداً أو آلةً أو بذراً — ويفزع له جيرانه.",
};

export default async function FazaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { supabase } = await nafirViewer();
  const { data } = await supabase
    .from("faza_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);
  const all = (data ?? []) as FazaRequest[];
  const open = all.filter((r) => r.status === "open");
  const met = all.filter((r) => r.status === "met");

  return (
    <NafirShell active="/nafir/faza" ok={ok} error={error}>
      <h1 className="text-2xl font-black">الفزعة</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        «من نفّس عن مؤمنٍ كربةً من كرب الدنيا نفّس الله عنه كربةً من كرب يوم
        القيامة». سيلٌ جرف البذر، أو آفةٌ أكلت الزرع، أو مرضٌ أقعد صاحب الأرض —
        يطلب هنا عوناً <strong>غير ماليّ</strong>، ويعاهده جيرانه بما يملكون.
        والوفاءُ يشهد به صاحبُ الحاجة، لا مَن وعد.
      </p>
      <Link href="/nafir/faza/new" className={`${button} mt-4 inline-block`}>اطلب فزعة</Link>

      <h2 className="mb-3 mt-8 text-xl font-bold">طلباتٌ مفتوحة</h2>
      {open.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">لا طلب مفتوح الآن، والحمد لله.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((r) => (
            <li key={r.id}>
              <Link href={`/nafir/faza/${r.id}`} className="block rounded-2xl border border-accent/40 bg-card p-4 transition hover:border-accent">
                <p className="text-xs text-muted">{FAZA_CAUSES[r.cause]} · {r.state} — {r.locality} · {ageAr(r.created_at)}</p>
                <p className="mt-1 font-bold">{r.title}</p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {r.needs.map((n) => (
                    <span key={n} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs">{FAZA_NEEDS[n]}</span>
                  ))}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {met.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-bold">قُضيت حاجتهم</h2>
          <ul className="flex flex-col gap-2">
            {met.map((r) => (
              <li key={r.id}>
                <Link href={`/nafir/faza/${r.id}`} className="block rounded-xl border border-border bg-card px-4 py-3 text-sm hover:border-primary">
                  {r.title} <span className="text-muted">· {r.state}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </NafirShell>
  );
}
