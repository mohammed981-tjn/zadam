import Link from "next/link";
import NafirShell, { button } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import {
  FAZA_CAUSES,
  FAZA_CAUSES_EN,
  FAZA_NEEDS,
  FAZA_NEEDS_EN,
  ageAr,
  label,
  stateName,
  typed,
  type FazaRequest,
} from "@/lib/nafir";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الفزعة | سوداقري", "Faza | Sudagri"),
    description: tr(
      locale,
      "مَن أصابته جائحةٌ في زرعه أو ماشيته يطلب عوناً — يداً أو آلةً أو بذراً — ويفزع له جيرانه.",
      "Whoever is struck by disaster in their crops or livestock asks for help — hands, machinery or seed — and the neighbours rush to help (faza).",
    ),
  };
}

export default async function FazaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
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
      <h1 className="text-2xl font-black">{t("الفزعة", "Faza")}</h1>
      {locale === "en" ? (
        <>
          <p lang="ar" dir="rtl" className="mt-2 leading-8 text-muted">
            «من نفّس عن مؤمنٍ كربةً من كرب الدنيا نفّس الله عنه كربةً من كرب يوم القيامة»
          </p>
          <p className="mt-1 max-w-2xl leading-8 text-muted">
            “Whoever relieves a believer of one of the hardships of this world, Allah will relieve him of one of the
            hardships of the Day of Resurrection” (hadith, Muslim). A flood that washed the seed away, pests that ate
            the crop, an illness that laid the farmer up — here they ask for <strong>non-cash</strong> help (faza), and
            their neighbours pledge what they have. Whether a pledge was kept is confirmed by the one in need, not by
            the one who promised.
          </p>
        </>
      ) : (
        <p className="mt-2 max-w-2xl leading-8 text-muted">
          «من نفّس عن مؤمنٍ كربةً من كرب الدنيا نفّس الله عنه كربةً من كرب يوم
          القيامة». سيلٌ جرف البذر، أو آفةٌ أكلت الزرع، أو مرضٌ أقعد صاحب الأرض —
          يطلب هنا عوناً <strong>غير ماليّ</strong>، ويعاهده جيرانه بما يملكون.
          والوفاءُ يشهد به صاحبُ الحاجة، لا مَن وعد.
        </p>
      )}
      <Link href="/nafir/faza/new" className={`${button} mt-4 inline-block`}>{t("اطلب فزعة", "Ask for faza")}</Link>

      <h2 className="mb-3 mt-8 text-xl font-bold">{t("طلباتٌ مفتوحة", "Open requests")}</h2>
      {open.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
          {t("لا طلب مفتوح الآن، والحمد لله.", "No open requests right now, praise be to God.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((r) => (
            <li key={r.id}>
              <Link href={`/nafir/faza/${r.id}`} className="block rounded-2xl border border-accent/40 bg-card p-4 transition hover:border-accent">
                <p className="text-xs text-muted">
                  {label(FAZA_CAUSES, FAZA_CAUSES_EN, r.cause, locale)} · {stateName(r.state, locale)} — <bdi>{r.locality}</bdi> ·{" "}
                  {ageAr(r.created_at, undefined, locale)}
                </p>
                <p className="mt-1 font-bold" {...typed(locale)}>{r.title}</p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {r.needs.map((need) => (
                    <span key={need} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs">
                      {label(FAZA_NEEDS, FAZA_NEEDS_EN, need, locale)}
                    </span>
                  ))}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {met.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-bold">{t("قُضيت حاجتهم", "Needs met")}</h2>
          <ul className="flex flex-col gap-2">
            {met.map((r) => (
              <li key={r.id}>
                <Link href={`/nafir/faza/${r.id}`} className="block rounded-xl border border-border bg-card px-4 py-3 text-sm hover:border-primary">
                  <bdi {...typed(locale)}>{r.title}</bdi> <span className="text-muted">· {stateName(r.state, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </NafirShell>
  );
}
