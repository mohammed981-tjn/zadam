import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import { button, card, ghost } from "@/lib/ui";
import { closeAccount, eraseIdentity } from "./actions";

export const metadata = { title: "إغلاق الحسابات | الإدارة | سوداقري" };

interface Request {
  id: string;
  user_id: string;
  reason: string | null;
  requested_at: string;
}

interface Closed {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  auth_phone: string | null;
  closed_at: string;
  reason: string;
  identity_erased_at: string | null;
  erase_reason: string | null;
}

/**
 * إغلاق الحسابات — شاشة الإدارة (البند ١٩٥).
 *
 * The owner of an account asks; an administrator closes it here. The real identity of a closed account stays on this
 * screen, for administrators alone, until one of them erases it with a reason.
 */
export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Khartoum" }) : "—";

  const [{ data: reqRows, error }, { data: closedRows }] = await Promise.all([
    supabase.from("account_closure_requests").select("id, user_id, reason, requested_at").eq("status", "open").order("requested_at"),
    supabase.from("closed_accounts").select("*").order("closed_at", { ascending: false }).limit(50),
  ]);
  const requests = (reqRows ?? []) as Request[];
  const closed = (closedRows ?? []) as Closed[];
  const ids = requests.map((r) => r.user_id);
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, full_name, phone").in("id", ids)
    : { data: [] as { id: string; full_name: string; phone: string | null }[] };
  const who = new Map(((people ?? []) as { id: string; full_name: string; phone: string | null }[]).map((p) => [p.id, p]));

  const reasonField = (label: string) => (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <input name="reason" required minLength={3} maxLength={300} className="rounded-lg border border-border bg-background px-2 py-1" />
    </label>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader icon="shield" eyebrow={t("الإدارة", "Administration")} title={t("إغلاق الحسابات", "Closing accounts")}>
        {t(
          "يطلب صاحب الحساب إغلاقه من صفحته، وتُغلقه أنت هنا: يتوقّف دخوله، ويختفي اسمه وجوّاله وبريده عن الناس كلّهم، وتُحذف إشعاراته وتنبيهاته، وتبقى دفاتره وعقوده ورسائله لأنّ لطرفٍ آخر حقّاً فيها. وهويّته الحقيقيّة تبقى هنا لك وحدك حتى تمحوها بسبب.",
          "The owner asks from their own page and you close the account here: sign-in stops, the name, phone and email are hidden from everyone, notifications and alerts are deleted, and books, agreements and messages stay because another party has a right to them. The real identity stays here, for you alone, until you erase it with a reason.",
        )}
      </PageHeader>
      <ActionNotice ok={sp.ok} error={sp.error} />

      {error && <p className={`${card} mb-6 text-sm text-muted`}>{t("تعمل هذه الشاشة بعد تطبيق هجرتها.", "This screen works once its migration is applied.")}</p>}

      <section className="mb-8">
        <h2 className="title-bar mb-3 font-black">
          {t("طلبات تنتظرك", "Requests waiting for you")} <span className="text-muted">({requests.length})</span>
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">{t("لا طلب.", "No request.")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id} className={card}>
                <p className="font-black">
                  {who.get(r.user_id)?.full_name || t("بلا اسم", "No name")}{" "}
                  <span className="text-xs font-normal text-muted" dir="ltr">{who.get(r.user_id)?.phone ?? ""}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t("طلب في ", "Asked on ")}
                  {when(r.requested_at)}
                  {r.reason && <> · «{r.reason}»</>}
                </p>
                <form action={closeAccount} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="user_id" value={r.user_id} />
                  {reasonField(t("سبب الإغلاق (٣ أحرفٍ فأكثر)", "Reason for closing (3 characters or more)"))}
                  <button className={button}>{t("أغلق الحساب", "Close the account")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="title-bar mb-3 font-black">{t("حساباتٌ مُغلَقة", "Closed accounts")}</h2>
        {closed.length === 0 ? (
          <p className="text-sm text-muted">{t("لم يُغلَق حسابٌ بعد.", "No account closed yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {closed.map((c) => (
              <li key={c.user_id} className={card}>
                {c.identity_erased_at ? (
                  <p className="font-black text-muted">{t("هويّةٌ ممحوّة", "Identity erased")}</p>
                ) : (
                  <p className="font-black">
                    {c.full_name || t("بلا اسم", "No name")}{" "}
                    <span className="text-xs font-normal text-muted" dir="ltr">
                      {[c.phone, c.auth_phone, c.email].filter(Boolean).join(" · ")}
                    </span>
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {t("أُغلق في ", "Closed on ")}
                  {when(c.closed_at)} · {c.reason}
                  {c.identity_erased_at && (
                    <>
                      {" · "}
                      {t("مُحيت هويّته في ", "identity erased on ")}
                      {when(c.identity_erased_at)} · {c.erase_reason}
                    </>
                  )}
                </p>
                {!c.identity_erased_at && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-primary underline">{t("امحُ الهويّة المحفوظة بسبب", "Erase the kept identity, with a reason")}</summary>
                    <form action={eraseIdentity} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="user_id" value={c.user_id} />
                      {reasonField(t("سبب المحو (٣ أحرفٍ فأكثر)", "Reason for erasing (3 characters or more)"))}
                      <button className={ghost}>{t("امحُ ولا رجعة", "Erase, for good")}</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
