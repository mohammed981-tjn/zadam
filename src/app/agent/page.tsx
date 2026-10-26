import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import { button, card, field, ghost, label } from "@/lib/ui";
import {
  AGENT_SCOPES,
  AGENT_SCOPE_LABEL,
  AGENT_SCOPE_SHORT,
  MANDATE_STATUS_LABEL,
  type AgentFarmerRow,
} from "@/lib/agent";
import { endMandate, requestMandate } from "./actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "مزارعيّ: وضع الوكيل | سوداقري", "My farmers: agent mode | Sudagri") };
}

/**
 * «مزارعيّ» (البند ١٦٩، الغنيمة ٧ من Apollo وMercy Corps): شركةٌ أو جمعيّة موثّقة تعمل عن مزارعين لا يحسنون التطبيق
 * أو لا يصلون إليه، بإذنٍ يعطيه كلٌّ منهم من حسابه. هنا تطلبه برقم جوّاله، وترى من قبل، وتدخل صفحة كلّ مزارع.
 */
export default async function AgentPage({ searchParams }: PageProps<"/agent">) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agent");

  // Which company is this account's: the owner's id is not a column members read (backlog 181).
  const { data: own } = await supabase.rpc("partner_company_private");
  const mine = ((own ?? []) as { id: string; owner_id: string }[]).find((c) => c.owner_id === user.id);
  const { data: companyRow } = mine
    ? await supabase.from("partner_companies").select("id, name, verified_at, active").eq("id", mine.id).maybeSingle()
    : { data: null };
  const company = companyRow as { id: string; name: string; verified_at: string | null; active: boolean } | null;
  const ready = !!company?.verified_at && company.active;

  const { data: rows, error } = ready ? await supabase.rpc("agent_my_farmers") : { data: null, error: null };
  if (error) console.error("agent: farmers failed", error.message);
  const all = (rows ?? []) as AgentFarmerRow[];
  const active = all.filter((m) => m.status === "active");
  const pending = all.filter((m) => m.status === "pending");
  const past = all.filter((m) => m.status !== "active" && m.status !== "pending");
  const date = (d: string) => new Date(d).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium" });
  const scopes = (m: AgentFarmerRow) => m.scopes.map((s) => tr(locale, ...AGENT_SCOPE_SHORT[s])).join(t(" و", ", "));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader icon="people" eyebrow={t("وضع الوكيل", "Agent mode")} title={t("مزارعيّ", "My farmers")}>
        {t(
          "تعمل جهتك عن المزارع الذي لا يحسن التطبيق أو لا يصل إليه: تسجّل أرضه وترفع أوراقها، وتتابع مواسمه وقطيعه. لا يبدأ شيءٌ قبل أن يقبل المزارع من حسابه هو، وينهيه متى شاء، ويرى كلّ ما كتبتَه باسمه.",
          "Your organisation acts for a farmer who cannot use the app or cannot reach it: it registers their land and uploads its papers, and follows their seasons and herds. Nothing starts before the farmer accepts from their own account; they end it whenever they like, and see everything you wrote in their name.",
        )}
      </PageHeader>

      {typeof sp.ok === "string" && <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm">{sp.ok}</p>}
      {typeof sp.error === "string" && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{sp.error}</p>}

      {!company ? (
        <section className={`${card} mt-6`}>
          <p className="leading-8">
            {t(
              "وضع الوكيل لشركةٍ أو جمعيّةٍ تعاونيّة موثّقة. سجّل جهتك أوّلاً، وحين تعتمدها الإدارة تعود إلى هنا.",
              "Agent mode is for a verified company or cooperative. Register your organisation first; once the administrators approve it, come back here.",
            )}
          </p>
          <Link href="/partners/mine" className={`${button} mt-4 inline-block`}>
            {t("سجّل جهتك", "Register your organisation")}
          </Link>
        </section>
      ) : !ready ? (
        <section className={`${card} mt-6`}>
          <p className="leading-8">
            {company.active
              ? t(
                  `«${company.name}» تنتظر توثيق الإدارة. يُفتح وضع الوكيل حين تُوثَّق.`,
                  `«${company.name}» is awaiting verification. Agent mode opens once it is verified.`,
                )
              : t(`«${company.name}» معطّلة، فلا تعمل عن أحد.`, `«${company.name}» is inactive, so it acts for no one.`)}
          </p>
        </section>
      ) : (
        <>
          <section className={`${card} mt-6`}>
            <h2 className="font-bold">{t("اطلب إذناً من مزارع", "Ask a farmer for permission")}</h2>
            <p className="mt-1 text-sm leading-7 text-muted">
              {t(
                "يجب أن يكون للمزارع حسابٌ برقمه. يصله طلبك وسببه، ولا ترى اسمه حتى يقبل. ثلاثون طلباً في اليوم حدُّ الجهة.",
                "The farmer needs an account under their number. They receive your request and its reason, and you do not see their name until they accept. Thirty requests a day is the limit.",
              )}
            </p>
            <form action={requestMandate} className="mt-4 grid gap-4">
              <label className={label}>
                {t("رقم جوّال المزارع", "The farmer's phone number")}
                <input name="phone" required inputMode="tel" placeholder="09xxxxxxxx" className={field} />
              </label>
              <fieldset className="grid gap-2 text-sm">
                <legend className="mb-1 font-medium">{t("ما تطلب الإذن فيه", "What you ask permission for")}</legend>
                {AGENT_SCOPES.map((s) => (
                  <label key={s} className="flex items-start gap-2">
                    <input type="checkbox" name={`scope_${s}`} defaultChecked={s === "lands"} className="mt-1" />
                    <span>{tr(locale, ...AGENT_SCOPE_LABEL[s])}</span>
                  </label>
                ))}
              </fieldset>
              <label className={label}>
                {t("لماذا تطلب؟ يقرؤه المزارع قبل أن يقبل", "Why are you asking? The farmer reads this before accepting")}
                <textarea
                  name="note"
                  required
                  minLength={10}
                  maxLength={300}
                  rows={3}
                  placeholder={t("مثلاً: نحن جمعيّة مزارعي القرية، نسجّل أرضك ونرفع أوراقها كما اتّفقنا في الاجتماع.", "For example: we are the village farmers' cooperative; we will register your land and upload its papers as agreed at the meeting.")}
                  className={field}
                />
              </label>
              <button className={button}>{t("أرسل الطلب", "Send the request")}</button>
            </form>
          </section>

          <section className="mt-8">
            <h2 className="font-bold">{t("من أذن لك", "Who has authorised you")}</h2>
            {active.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("لم يقبل أحدٌ بعد.", "No one has accepted yet.")}</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {active.map((m) => (
                  <li key={m.id} className={card}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link href={`/agent/${m.farmer_id}`} className="text-lg font-black text-primary underline">
                          {m.full_name || t("مزارع", "A farmer")}
                        </Link>
                        <p className="text-sm text-muted">
                          {m.phone && <span dir="ltr">{m.phone}</span>} · {scopes(m)} · {t("منذ ", "since ")}
                          {m.answered_at && date(m.answered_at)}
                        </p>
                      </div>
                      <form action={endMandate}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="from" value="/agent" />
                        <button className={ghost}>{t("أنهِ العمل عنه", "Stop acting for them")}</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pending.length > 0 && (
            <section className="mt-8">
              <h2 className="font-bold">{t("طلباتٌ تنتظر", "Requests waiting")}</h2>
              <ul className="mt-3 grid gap-2">
                {pending.map((m) => (
                  <li key={m.id} className={`${card} flex flex-wrap items-center justify-between gap-3 text-sm`}>
                    <span>
                      <span dir="ltr">…{m.phone_tail}</span> · {scopes(m)} · {date(m.requested_at)}
                    </span>
                    <form action={endMandate}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="from" value="/agent" />
                      <button className={ghost}>{t("اسحب الطلب", "Withdraw")}</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {past.length > 0 && (
            <section className="mt-8">
              <h2 className="font-bold">{t("ما مضى", "Past")}</h2>
              <ul className="mt-3 grid gap-1 text-sm text-muted">
                {past.map((m) => (
                  <li key={m.id}>
                    <span dir="ltr">…{m.phone_tail}</span> · {scopes(m)} · {tr(locale, ...MANDATE_STATUS_LABEL[m.status])} ·{" "}
                    {date(m.ended_at ?? m.answered_at ?? m.requested_at)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
