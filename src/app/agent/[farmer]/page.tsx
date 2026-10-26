import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { cropName } from "@/lib/farmLabelsEn";
import LandDocuments from "@/components/LandDocuments";
import { button, card } from "@/lib/ui";
import { AGENT_SCOPE_SHORT, type AgentFarmerRow } from "@/lib/agent";
import type { Land } from "@/types/database";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "مزارعٌ تعمل عنه | سوداقري", "A farmer you act for | Sudagri") };
}

type SeasonRow = {
  id: string;
  name: string;
  crop_key: string;
  feddans: number;
  planting_date: string;
  status: string;
  stages_done: number;
  stages_total: number;
};
type HerdRow = { id: string; name: string; head_count: number; start_date: string; status: string; stages_done: number; stages_total: number };
type ActionRow = { id: number; subject: "land" | "land_document"; subject_id: string; action: "insert" | "update"; at: string };

/**
 * صفحة مزارعٍ يعمل عنه الوكيل (البند ١٦٩): أراضيه بأوراقها وتسجيل أرضٍ جديدة باسمه، ومواسمه وقطيعه إن أُذن فيها،
 * وما كتبه الوكيل عنه. لا تُفتح إلا بإذنٍ قائم؛ والقاعدة نفسها لا تُرجع شيئاً بغيره.
 */
export default async function AgentFarmerPage({ params }: PageProps<"/agent/[farmer]">) {
  const { farmer } = await params;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/agent/${farmer}`);

  const { data: rows } = await supabase.rpc("agent_my_farmers");
  const m = ((rows ?? []) as AgentFarmerRow[]).find((r) => r.status === "active" && r.farmer_id === farmer);
  if (!m) notFound();
  const can = (s: AgentFarmerRow["scopes"][number]) => m.scopes.includes(s);

  const [{ data: landRows }, { data: seasonRows }, { data: herdRows }, { data: actionRows }] = await Promise.all([
    can("lands")
      ? supabase.from("lands").select("*").eq("owner_id", farmer).order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    can("seasons") ? supabase.rpc("agent_farmer_seasons", { p_farmer: farmer }) : Promise.resolve({ data: null }),
    can("herds") ? supabase.rpc("agent_farmer_herds", { p_farmer: farmer }) : Promise.resolve({ data: null }),
    supabase
      .from("agent_actions")
      .select("id, subject, subject_id, action, at")
      .eq("farmer_id", farmer)
      .eq("agent_id", user.id)
      .order("at", { ascending: false })
      .limit(30),
  ]);
  const lands = (landRows ?? []) as Land[];
  const { data: docRows } = lands.length
    ? await supabase.from("land_documents").select("id, land_id, kind, caption").in("land_id", lands.map((l) => l.id))
    : { data: [] };
  const documents = (docRows ?? []) as { id: string; land_id: string; kind: string; caption: string | null }[];
  const seasons = (seasonRows ?? []) as SeasonRow[];
  const herds = (herdRows ?? []) as HerdRow[];
  const actions = (actionRows ?? []) as ActionRow[];
  const date = (d: string) => new Date(d).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium" });
  const verification: Record<string, [string, string]> = {
    unverified: ["لم تُرفع أوراقها", "Papers not uploaded"],
    submitted: ["تنتظر المراجعة", "Awaiting review"],
    verified: ["موثّقة", "Verified"],
    rejected: ["رُدّت", "Returned"],
  };
  const landName = new Map(lands.map((l) => [l.id, l.name]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/agent" className="text-sm text-primary underline">
        {t("→ مزارعيّ", "← My farmers")}
      </Link>
      <h1 className="mt-4 font-black" style={{ fontSize: "var(--text-title)" }}>
        {m.full_name || t("مزارع", "A farmer")}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {m.phone && <span dir="ltr">{m.phone}</span>} · {t("أذن لك في: ", "Authorised you for: ")}
        {m.scopes.map((s) => tr(locale, ...AGENT_SCOPE_SHORT[s])).join(t(" و", ", "))}
      </p>

      {can("lands") && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t("أراضيه", "Their land")}</h2>
            <Link href={`/lands/new?for=${farmer}`} className={button}>
              {t("سجّل أرضاً باسمه", "Register a land in their name")}
            </Link>
          </div>
          {lands.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("لا أرض له بعد.", "No land yet.")}</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {lands.map((l) => (
                <li key={l.id} className={card}>
                  <p className="font-bold">
                    <Link href={`/lands/${l.id}`} className="underline">
                      {l.name}
                    </Link>
                  </p>
                  <p className="text-sm text-muted">
                    {l.state}
                    {l.locality && ` · ${l.locality}`} · {l.feddans} {t("فدان", "feddans")} ·{" "}
                    {tr(locale, ...(verification[l.verification] ?? [l.verification, l.verification]))}
                  </p>
                  <LandDocuments landId={l.id} existing={documents.filter((d) => d.land_id === l.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {can("seasons") && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">{t("مواسمه", "Their seasons")}</h2>
          {seasons.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("لا موسم له بعد.", "No season yet.")}</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {seasons.map((s) => (
                <li key={s.id} className={`${card} text-sm`}>
                  <span className="font-bold">{s.name}</span> · {cropName(s.crop_key, locale)} · {s.feddans}{" "}
                  {t("فدان", "feddans")} · {t("زُرع ", "planted ")}
                  {date(s.planting_date)} · {t("المراحل: ", "Stages: ")}
                  {s.stages_done}/{s.stages_total}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {can("herds") && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">{t("قطيعه", "Their herds")}</h2>
          {herds.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("لا قطيع له بعد.", "No herd yet.")}</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {herds.map((h) => (
                <li key={h.id} className={`${card} text-sm`}>
                  <span className="font-bold">{h.name}</span> · {h.head_count} {t("رأس", "head")} · {t("منذ ", "since ")}
                  {date(h.start_date)} · {t("المراحل: ", "Stages: ")}
                  {h.stages_done}/{h.stages_total}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold">{t("ما كتبتَه باسمه", "What you wrote in their name")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("يراه المزارع كما تراه، ولا يُمحى.", "The farmer sees this as you do, and it is never erased.")}
        </p>
        {actions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("لا شيء بعد.", "Nothing yet.")}</p>
        ) : (
          <ul className="mt-3 grid gap-1 text-sm">
            {actions.map((a) => (
              <li key={a.id}>
                {date(a.at)} ·{" "}
                {a.subject === "land"
                  ? a.action === "insert"
                    ? t("سجّلت أرضاً", "Registered a land")
                    : t("عدّلت أرضاً", "Edited a land")
                  : t("رفعت مستنداً", "Uploaded a document")}
                {a.subject === "land" && landName.get(a.subject_id) && ` «${landName.get(a.subject_id)}»`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
