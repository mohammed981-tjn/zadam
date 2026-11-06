import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import { button, card, ghost } from "@/lib/ui";
import {
  AGENT_SCOPE_LABEL,
  AGENT_SCOPE_SHORT,
  MANDATE_STATUS_LABEL,
  agentActionLabel,
  type AgentActionSubject,
  type AgentActionVerb,
  type MyAgentRow,
} from "@/lib/agent";
import { answerMandate, endMandate } from "@/app/agent/actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "وكلائي | سوداقري", "My agents | Sudagri") };
}

type ActionRow = {
  id: number;
  mandate_id: string;
  subject: AgentActionSubject;
  subject_id: string;
  action: AgentActionVerb;
  at: string;
};

/**
 * «وكلائي» (البند ١٦٩): من طلب أن يعمل عنك، وما طلبه ولماذا. تقبل أو تعتذر، وتُنهي ما قبلته متى شئت، وترى كلّ ما
 * كتبه الوكيل باسمك. هذا القبول هو الإذن المسجَّل: لا يعمل أحدٌ عنك بغيره.
 */
export default async function MyAgentsPage({ searchParams }: PageProps<"/account/agents">) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/agents");

  const [{ data: rows, error }, { data: actionRows }] = await Promise.all([
    supabase.rpc("agent_my_agents"),
    supabase
      .from("agent_actions")
      .select("id, mandate_id, subject, subject_id, action, at")
      .eq("farmer_id", user.id)
      .order("at", { ascending: false })
      .limit(50),
  ]);
  if (error) console.error("account/agents: failed", error.message);
  const all = (rows ?? []) as MyAgentRow[];
  const pending = all.filter((m) => m.status === "pending");
  const active = all.filter((m) => m.status === "active");
  const past = all.filter((m) => m.status !== "active" && m.status !== "pending");
  const actions = (actionRows ?? []) as ActionRow[];
  const company = new Map(all.map((m) => [m.id, m.company_name]));
  const landIds = [...new Set(actions.filter((a) => a.subject === "land").map((a) => a.subject_id))];
  const { data: landRows } = landIds.length
    ? await supabase.from("lands").select("id, name").in("id", landIds)
    : { data: [] };
  const landName = new Map(((landRows ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
  // A stage or a piece of evidence links to its season (20261106050000), and says whether you objected.
  const stageIds = actions.filter((a) => a.subject === "season_stage").map((a) => a.subject_id);
  const evidenceIds = actions.filter((a) => a.subject === "stage_evidence").map((a) => a.subject_id);
  const [{ data: evidenceRows }, { data: objectionRows }] = await Promise.all([
    evidenceIds.length
      ? supabase.from("stage_evidence").select("id, stage_id").in("id", evidenceIds)
      : Promise.resolve({ data: [] }),
    actions.length
      ? supabase.from("agent_objections").select("action_id").in("action_id", actions.map((a) => a.id))
      : Promise.resolve({ data: [] }),
  ]);
  const stageOfEvidence = new Map(((evidenceRows ?? []) as { id: string; stage_id: string }[]).map((e) => [e.id, e.stage_id]));
  const allStageIds = [...new Set([...stageIds, ...stageOfEvidence.values()])];
  const { data: stageRows } = allStageIds.length
    ? await supabase.from("season_stages").select("id, season_id").in("id", allStageIds)
    : { data: [] };
  const seasonOfStage = new Map(((stageRows ?? []) as { id: string; season_id: string }[]).map((g) => [g.id, g.season_id]));
  const seasonOf = (a: ActionRow) =>
    a.subject === "season_stage"
      ? seasonOfStage.get(a.subject_id)
      : a.subject === "stage_evidence"
        ? seasonOfStage.get(stageOfEvidence.get(a.subject_id) ?? "")
        : undefined;
  const objected = new Set(((objectionRows ?? []) as { action_id: number }[]).map((o) => o.action_id));
  const date = (d: string) => new Date(d).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:max-w-5xl">
      <PageHeader icon="people" eyebrow={t("حسابي", "My account")} title={t("وكلائي: من يعمل عنّي", "My agents: who acts for me")}>
        {t(
          "جمعيّةٌ أو شركةٌ موثّقة تستطيع أن تسجّل أرضك وترفع أوراقها وتتابع مواسمك وقطيعك عنك، إن أذنت لها. لا تعمل إلا في ما أذنت فيه، وتُنهيه متى شئت، وما كتبته باسمك تراه هنا ويبقى لك.",
          "A verified cooperative or company can register your land, upload its papers and follow your seasons and herds for you, if you allow it. It acts only in what you allowed; you end it whenever you like; and what it wrote in your name shows here and stays yours.",
        )}
      </PageHeader>

      {typeof sp.ok === "string" && <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm">{sp.ok}</p>}
      {typeof sp.error === "string" && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{sp.error}</p>}

      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="font-bold">{t("يطلبون إذنك", "Asking for your permission")}</h2>
          <ul className="mt-3 grid gap-3">
            {pending.map((m) => (
              <li key={m.id} className={`${card} ring-2 ring-accent/40`}>
                <p className="text-lg font-black">{m.company_name}</p>
                <p className="text-sm text-muted">
                  <span dir="ltr">{m.company_phone}</span> · {date(m.requested_at)}
                </p>
                <p className="mt-3 text-sm font-medium">{t("يطلب أن يعمل عنك في:", "Asks to act for you in:")}</p>
                <ul className="mt-1 list-disc ps-5 text-sm leading-7">
                  {m.scopes.map((s) => (
                    <li key={s}>{tr(locale, ...AGENT_SCOPE_LABEL[s])}</li>
                  ))}
                </ul>
                <p className="mt-3 rounded-xl bg-background p-3 text-sm leading-7">
                  {t("سببه: ", "Their reason: ")}
                  {m.note}
                </p>
                <p className="mt-3 text-xs leading-6 text-muted">
                  {t(
                    "لا يحذف شيئاً من مالك، ولا ينقل أرضك إلى غيرك، ولا يعرضها على المستثمرين. اقبل فقط إن كنت تعرف هذه الجهة.",
                    "It cannot delete anything of yours, move your land to anyone else, or offer it to investors. Accept only if you know this organisation.",
                  )}
                </p>
                <form action={answerMandate} className="mt-4 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <button name="decision" value="accept" className={button}>
                    {t("أقبل", "Accept")}
                  </button>
                  <button name="decision" value="decline" className={ghost}>
                    {t("أعتذر", "Decline")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-bold">{t("يعملون عنك الآن", "Acting for you now")}</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("لا أحد.", "No one.")}</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {active.map((m) => (
              <li key={m.id} className={`${card} flex flex-wrap items-start justify-between gap-3`}>
                <div>
                  <p className="font-black">{m.company_name}</p>
                  <p className="text-sm text-muted">
                    <span dir="ltr">{m.company_phone}</span> ·{" "}
                    {m.scopes.map((s) => tr(locale, ...AGENT_SCOPE_SHORT[s])).join(t(" و", ", "))} · {t("منذ ", "since ")}
                    {m.answered_at && date(m.answered_at)}
                  </p>
                </div>
                <form action={endMandate}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className={ghost}>{t("أنهِ الإذن", "End the permission")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-bold">{t("ما كتبه الوكلاء باسمك", "What agents wrote in your name")}</h2>
        {actions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("لا شيء.", "Nothing.")}</p>
        ) : (
          <ul className="mt-3 grid gap-1 text-sm">
            {actions.map((a) => (
              <li key={a.id}>
                {date(a.at)} · {company.get(a.mandate_id) ?? t("وكيل", "an agent")} ·{" "}
                {tr(locale, ...agentActionLabel(a.subject, a.action, "farmer"))}
                {seasonOf(a) && (
                  <>
                    {" "}
                    <Link href={`/seasons/${seasonOf(a)}`} className="text-primary underline">
                      {t("(الموسم)", "(the season)")}
                    </Link>
                  </>
                )}
                {objected.has(a.id) && <span className="text-danger">{t(" · اعترضت عليه", " · you objected")}</span>}
                {a.subject === "land" && landName.get(a.subject_id) && (
                  <>
                    {" "}
                    <Link href={`/lands/${a.subject_id}`} className="text-primary underline">
                      «{landName.get(a.subject_id)}»
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="font-bold">{t("ما مضى", "Past")}</h2>
          <ul className="mt-3 grid gap-1 text-sm text-muted">
            {past.map((m) => (
              <li key={m.id}>
                {m.company_name} · {tr(locale, ...MANDATE_STATUS_LABEL[m.status])} · {date(m.ended_at ?? m.answered_at ?? m.requested_at)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
