import Link from "next/link";
import { notFound } from "next/navigation";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import { FAZA_CAUSES, FAZA_NEEDS, ageAr, type FazaPledge, type FazaRequest } from "@/lib/nafir";
import { closeFaza, markKept, pledgeFaza } from "../../actions";

export const metadata = { title: "طلب فزعة | سوداغري" };

/**
 * A request and its pledges. The one who asked is the only one who can say a
 * pledge was kept — the button appears for them alone, and the database
 * refuses it from anyone else (scripts/verify-nafir.sql, section ج).
 */
export default async function FazaRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user, name } = await nafirViewer();

  const [{ data: reqRow }, { data: pledgeRows }] = await Promise.all([
    supabase.from("faza_requests").select("*").eq("id", id).maybeSingle(),
    supabase.from("faza_pledges").select("*").eq("request_id", id).order("created_at"),
  ]);
  const req = reqRow as FazaRequest | null;
  if (!req) notFound();
  const pledges = (pledgeRows ?? []) as FazaPledge[];
  const isOwner = user?.id === req.requester_id;
  const open = req.status === "open";
  const kept = pledges.filter((p) => p.kept_at).length;

  return (
    <NafirShell active="/nafir/faza" ok={ok} error={error}>
      <p className="text-sm font-medium text-accent">
        {FAZA_CAUSES[req.cause]} · {req.state} — {req.locality}
      </p>
      <h1 className="mt-1 text-2xl font-bold leading-snug">{req.title}</h1>
      <p className="mt-1 text-sm text-muted">
        يطلبها {req.display_name} · {ageAr(req.created_at)}
        {req.status === "met" && " · قُضيت الحاجة"}
        {req.status === "closed" && " · أُغلق الطلب"}
      </p>
      <p className="mt-4 whitespace-pre-line leading-8">{req.description}</p>
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        يفيده:
        {req.needs.map((n) => (
          <span key={n} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs">{FAZA_NEEDS[n]}</span>
        ))}
      </p>
      <ShareWhatsApp path={`/nafir/faza/${req.id}`} text={`فزعة: ${req.title} — ${req.locality}. مَن يقدر يعين؟`} className="mt-4" />

      {/* ───────── العهود ───────── */}
      <section className="mt-6">
        <h2 className="mb-2 font-bold">
          العهود ({pledges.length}){pledges.length > 0 && <span className="text-sm font-normal text-muted"> · وُفّي منها {kept}</span>}
        </h2>
        {pledges.length === 0 ? (
          <p className="text-sm text-muted">لم يعاهد أحدٌ بعد.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pledges.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
                <span className="text-sm">
                  <strong>{p.display_name}</strong> — {FAZA_NEEDS[p.kind]}: {p.detail}
                </span>
                {p.kept_at ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">وفّى ✓</span>
                ) : isOwner ? (
                  <form action={markKept}>
                    <input type="hidden" name="request_id" value={req.id} />
                    <input type="hidden" name="pledge_id" value={p.id} />
                    <button className={ghost}>وصلني — أشهد بالوفاء</button>
                  </form>
                ) : (
                  <span className="text-xs text-muted">لم يُشهد بعد</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ───────── العهد ───────── */}
      {open && !isOwner && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          {!user ? (
            <p className="text-sm">
              <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> لتفزع له.
            </p>
          ) : (
            <form action={pledgeFaza} className="flex flex-col gap-3">
              <input type="hidden" name="request_id" value={req.id} />
              <h2 className="font-bold">افزع له</h2>
              <p className="text-xs text-muted">«وأوفوا بالعهد إنّ العهد كان مسؤولاً» — لا تعِد إلا بما تقدر عليه.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  نوع العون
                  <select name="kind" required className={field} defaultValue={req.needs[0]}>
                    {Object.entries(FAZA_NEEDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  اسمك كما يراه الناس
                  <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                ما تعاهد عليه بالتحديد
                <input name="detail" required minLength={3} maxLength={300} className={field} placeholder="جوالان من تقاوي الذرة، أوصلهما يوم الخميس" />
              </label>
              <button className={`${button} self-start`}>أعاهد</button>
            </form>
          )}
        </section>
      )}

      {open && isOwner && (
        <section className="mt-8 flex flex-wrap gap-3">
          <form action={closeFaza}>
            <input type="hidden" name="request_id" value={req.id} />
            <input type="hidden" name="status" value="met" />
            <button className={button}>قُضيت حاجتي — أغلق الطلب</button>
          </form>
          <form action={closeFaza}>
            <input type="hidden" name="request_id" value={req.id} />
            <input type="hidden" name="status" value="closed" />
            <button className={ghost}>أغلق دون قضاء</button>
          </form>
        </section>
      )}
    </NafirShell>
  );
}
