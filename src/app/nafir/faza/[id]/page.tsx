import Link from "next/link";
import { notFound } from "next/navigation";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
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
  type FazaPledge,
  type FazaRequest,
} from "@/lib/nafir";
import { closeFaza, markKept, pledgeFaza } from "../../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "طلب فزعة | سوداقري", "Faza request | Sudagri") };
}

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
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const en = locale === "en";
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
  const needs = en ? FAZA_NEEDS_EN : FAZA_NEEDS;

  return (
    <NafirShell active="/nafir/faza" ok={ok} error={error}>
      <p className="text-sm font-medium text-accent">
        {label(FAZA_CAUSES, FAZA_CAUSES_EN, req.cause, locale)} · {stateName(req.state, locale)} — <bdi>{req.locality}</bdi>
      </p>
      <h1 className="mt-1 text-2xl font-bold leading-snug" {...typed(locale)}>{req.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {t("يطلبها", "Requested by")} <bdi>{req.display_name}</bdi> · {ageAr(req.created_at, undefined, locale)}
        {req.status === "met" && t(" · قُضيت الحاجة", " · Need met")}
        {req.status === "closed" && t(" · أُغلق الطلب", " · Request closed")}
      </p>
      <p className="mt-4 whitespace-pre-line leading-8" {...typed(locale)}>{req.description}</p>
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        {t("يفيده:", "Would help:")}
        {req.needs.map((need) => (
          <span key={need} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs">{label(FAZA_NEEDS, FAZA_NEEDS_EN, need, locale)}</span>
        ))}
      </p>
      <ShareWhatsApp
        path={`/nafir/faza/${req.id}`}
        text={en ? `Faza: ${req.title} — ${req.locality}. Who can help?` : `فزعة: ${req.title} — ${req.locality}. مَن يقدر يعين؟`}
        className="mt-4"
        locale={locale}
      />

      {/* ───────── العهود ───────── */}
      <section className="mt-6">
        <h2 className="mb-2 font-bold">
          {t("العهود", "Pledges")} ({pledges.length})
          {pledges.length > 0 && (
            <span className="text-sm font-normal text-muted">
              {en ? ` · ${kept} kept` : ` · وُفّي منها ${kept}`}
            </span>
          )}
        </h2>
        {pledges.length === 0 ? (
          <p className="text-sm text-muted">{t("لم يعاهد أحدٌ بعد.", "No one has pledged yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pledges.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
                <span className="text-sm">
                  <strong><bdi>{p.display_name}</bdi></strong> — {label(FAZA_NEEDS, FAZA_NEEDS_EN, p.kind, locale)}:{" "}
                  <bdi {...typed(locale)}>{p.detail}</bdi>
                </span>
                {p.kept_at ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{t("وفّى ✓", "Kept ✓")}</span>
                ) : isOwner ? (
                  <form action={markKept}>
                    <input type="hidden" name="request_id" value={req.id} />
                    <input type="hidden" name="pledge_id" value={p.id} />
                    <button className={ghost}>{t("وصلني — أشهد بالوفاء", "I received it — confirm kept")}</button>
                  </form>
                ) : (
                  <span className="text-xs text-muted">{t("لم يُشهد بعد", "Not yet confirmed")}</span>
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
              <Link href="/login" className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
              {t("لتفزع له.", "to help them.")}
            </p>
          ) : (
            <form action={pledgeFaza} className="flex flex-col gap-3">
              <input type="hidden" name="request_id" value={req.id} />
              <h2 className="font-bold">{t("افزع له", "Pledge help")}</h2>
              {en ? (
                <p className="text-xs text-muted">
                  <span lang="ar" dir="rtl">«وأوفوا بالعهد إنّ العهد كان مسؤولاً»</span> — “And fulfil [every] commitment.
                  Indeed, the commitment is ever [that about which one will be] questioned” (al-Isra 17:34). Promise only
                  what you can do.
                </p>
              ) : (
                <p className="text-xs text-muted">«وأوفوا بالعهد إنّ العهد كان مسؤولاً» — لا تعِد إلا بما تقدر عليه.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  {t("نوع العون", "Kind of help")}
                  <select name="kind" required className={field} defaultValue={req.needs[0]}>
                    {Object.entries(needs).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("اسمك كما يراه الناس", "Your name as others will see it")}
                  <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                {t("ما تعاهد عليه بالتحديد", "Exactly what you pledge")}
                <input
                  name="detail"
                  required
                  minLength={3}
                  maxLength={300}
                  className={field}
                  placeholder={t("جوالان من تقاوي الذرة، أوصلهما يوم الخميس", "Two sacks of sorghum seed, delivered on Thursday")}
                />
              </label>
              <button className={`${button} self-start`}>{t("أعاهد", "I pledge")}</button>
            </form>
          )}
        </section>
      )}

      {open && isOwner && (
        <section className="mt-8 flex flex-wrap gap-3">
          <form action={closeFaza}>
            <input type="hidden" name="request_id" value={req.id} />
            <input type="hidden" name="status" value="met" />
            <button className={button}>{t("قُضيت حاجتي — أغلق الطلب", "My need is met — close the request")}</button>
          </form>
          <form action={closeFaza}>
            <input type="hidden" name="request_id" value={req.id} />
            <input type="hidden" name="status" value="closed" />
            <button className={ghost}>{t("أغلق دون قضاء", "Close without it being met")}</button>
          </form>
        </section>
      )}
    </NafirShell>
  );
}
