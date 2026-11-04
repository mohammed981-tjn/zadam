import Link from "next/link";
import { redirect } from "next/navigation";
import NafirShell from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginHrefHere } from "@/lib/loginHere";
import {
  NAFIR_KINDS,
  NAFIR_KINDS_EN,
  ageAr,
  ar,
  label,
  typed,
  type FazaPledge,
  type NafirCall,
  type NafirJoin,
} from "@/lib/nafir";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "سجلّ عطائي | سوداقري", "My giving | Sudagri"), robots: { index: false } };
}

/**
 * What this household gave and what it received — for its own eyes only.
 *
 * The tradition behind it is the reciprocal labour group, where each member
 * receives as much labour as they give (Ziche & Salih 1984, via Bashir). The
 * research warns against the public version of the same numbers: rankings
 * shame, and a ranked nafir is no longer horizontal (Hamari et al. 2014). So
 * the balance is private — nobody else can open this page, and nothing here
 * is compared with anyone.
 */
export default async function MinePage() {
  const { supabase, user } = await nafirViewer();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const n = (x: number) => ar(x, locale);
  const en = locale === "en";

  const [joined, hosted, pledgesMade, myRequests] = await Promise.all([
    supabase.from("nafir_joins").select("*, nafir_calls(*)").eq("user_id", user.id).order("joined_at", { ascending: false }),
    supabase.from("nafir_calls").select("*").eq("organizer_id", user.id).order("starts_on", { ascending: false }),
    supabase.from("faza_pledges").select("*").eq("pledger_id", user.id).order("created_at", { ascending: false }),
    supabase.from("faza_requests").select("id").eq("requester_id", user.id),
  ]);

  const joins = (joined.data ?? []) as (NafirJoin & { nafir_calls: NafirCall | null })[];
  const calls = (hosted.data ?? []) as NafirCall[];
  const made = (pledgesMade.data ?? []) as FazaPledge[];
  const requestIds = ((myRequests.data ?? []) as { id: string }[]).map((r) => r.id);
  const { data: receivedRows } = requestIds.length
    ? await supabase.from("faza_pledges").select("*").in("request_id", requestIds)
    : { data: [] };
  const received = (receivedRows ?? []) as FazaPledge[];

  const joinedDone = joins.filter((j) => j.nafir_calls?.status === "done").length;
  const hostedDone = calls.filter((c) => c.status === "done");
  const handsReceived = hostedDone.reduce((a, c) => a + (c.attended ?? 0), 0);
  const madeKept = made.filter((p) => p.kept_at).length;
  const receivedKept = received.filter((p) => p.kept_at).length;

  return (
    <NafirShell active="/nafir/mine">
      <h1 className="text-2xl font-black">{t("سجلّ عطائي", "My giving")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "ما أعطيتَ وما أُعطيت — لك وحدك. لا يراه أحد، ولا يُقارَن بأحد. هو ميزان النفير القديم: تلبّي جارك كما يلبّيك.",
          "What you have given and what you have received — for you alone. No one else sees it, and it is compared with no one. It is the old balance of nafir: you answer your neighbour as they answer you.",
        )}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <h2 className="font-bold text-primary">{t("أعطيتَ", "You gave")}</h2>
          <dl className="mt-3 flex flex-col gap-3">
            <Row
              label={t("نفيرٌ لبّيتَه", "Nafirs you answered")}
              value={`${n(joins.length)}`}
              note={en ? `${n(joinedDone)} of them completed` : `منها ${n(joinedDone)} أُنجز`}
            />
            <Row
              label={t("عهود فزعة", "Faza pledges")}
              value={`${n(made.length)}`}
              note={made.length ? (en ? `${n(madeKept)} kept, confirmed by those you helped` : `وفيتَ ${n(madeKept)} بشهادة أصحابها`) : "—"}
            />
          </dl>
        </section>
        <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <h2 className="font-bold text-accent">{t("أُعطيتَ", "You received")}</h2>
          <dl className="mt-3 flex flex-col gap-3">
            <Row
              label={t("أيدٍ حضرت نفيرك", "Hands at your nafirs")}
              value={`${n(handsReceived)}`}
              note={en ? `across ${n(hostedDone.length)} completed nafirs` : `في ${n(hostedDone.length)} نفيرٍ أُنجز`}
            />
            <Row
              label={t("عهود فزعة لك", "Faza pledges to you")}
              value={`${n(received.length)}`}
              note={received.length ? (en ? `${n(receivedKept)} of them kept` : `وُفّي منها ${n(receivedKept)}`) : "—"}
            />
          </dl>
        </section>
      </div>

      {joins.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-bold">{t("ما لبّيتَه", "Calls you answered")}</h2>
          <ul className="flex flex-col gap-2">
            {joins.map((j) =>
              j.nafir_calls ? (
                <li key={j.call_id}>
                  <Link href={`/nafir/${j.call_id}`} className="block rounded-xl border border-border bg-card px-4 py-2 text-sm hover:border-primary">
                    {label(NAFIR_KINDS, NAFIR_KINDS_EN, j.nafir_calls.kind, locale)}: <bdi {...typed(locale)}>{j.nafir_calls.title}</bdi>
                    <span className="block text-xs text-muted">
                      {t("دعا إليه", "Called by")} <bdi>{j.nafir_calls.display_name}</bdi> · {ageAr(j.joined_at, undefined, locale)}
                    </span>
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}

      {made.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-bold">{t("عهودي", "My pledges")}</h2>
          <ul className="flex flex-col gap-2">
            {made.map((p) => (
              <li key={p.id}>
                <Link href={`/nafir/faza/${p.request_id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm hover:border-primary">
                  <span {...typed(locale)}>{p.detail}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.kept_at ? "bg-primary/15 text-primary" : "bg-border text-muted"}`}>
                    {p.kept_at ? t("وفّيت", "Kept") : t("لم يُشهد بعد", "Not yet confirmed")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {joins.length + made.length + calls.length + received.length === 0 && (
        <p className="mt-8 rounded-2xl border border-border bg-card p-5 text-sm text-muted">
          {t("سجلّك فارغٌ بعد. ابدأ من", "Your record is still empty. Start from the")}{" "}
          <Link href="/nafir" className="text-primary underline">{t("ساحة النفير", "Nafir square")}</Link>.
        </p>
      )}
    </NafirShell>
  );
}

function Row({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="figure text-2xl font-black">{value}</dd>
      <dd className="figure text-xs text-muted">{note}</dd>
    </div>
  );
}
