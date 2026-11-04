import Link from "next/link";
import NafirShell, { button, field } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";
import { NAFIR_KINDS, NAFIR_KINDS_EN, SUDAN_STATES, stateName, tomorrowIso } from "@/lib/nafir";
import { createCall } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "ادعُ إلى نفير | سوداقري", "Call a nafir | Sudagri") };
}

/**
 * The call, in the order the tradition makes it: what work, where, which day,
 * how many hands — and the two halves of the bargain, what the host provides
 * and what the helper carries. A neighbour decides from this one screen.
 */
export default async function NewCallPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; canal?: string }>;
}) {
  const { error, canal } = await searchParams;
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const { supabase, user, name } = await nafirViewer();
  // The canals this person belongs to, so a canal-cleaning call can be tied
  // to its canal and show on that canal's page. The database refuses the tie
  // for anyone who is not a member (guard_nafir_call).
  const { data: myCanals } = user
    ? await supabase
        .from("canal_members")
        .select("canal_id, canals(name)")
        .eq("user_id", user.id)
        .eq("status", "member")
    : { data: [] };
  const canals = ((myCanals ?? []) as unknown as { canal_id: string; canals: { name: string } | null }[])
    .map((c) => ({ id: c.canal_id, name: c.canals?.name ?? t("ترعة", "Canal") }));
  const tomorrow = tomorrowIso();
  const kinds = locale === "en" ? NAFIR_KINDS_EN : NAFIR_KINDS;

  return (
    <NafirShell active="/nafir" error={error}>
      <h1 className="text-2xl font-bold">{t("ادعُ إلى نفير", "Call a nafir")}</h1>
      <p className="mb-6 mt-2 text-sm leading-7 text-muted">
        {t(
          "النفير عملٌ جماعيٌّ بلا أجر، يُكرم فيه صاحبُ الحاجة مَن لبّاه، ويلبّي هو حين يُدعى. اكتب ما يلزم ليقرّر جارك في قراءةٍ واحدة.",
          "A nafir is unpaid communal work: the one in need hosts those who answer, and answers in turn when called. Write what your neighbour needs to decide in a single reading.",
        )}
      </p>
      {!user ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm">
          <Link href={loginTo(canal ? `/nafir/new?canal=${encodeURIComponent(canal)}` : "/nafir/new")} className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
          {t("لتدعو إلى نفير.", "to call a nafir.")}
        </p>
      ) : (
        <form action={createCall} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <label className="flex flex-col gap-1 text-sm">
            {t("نوع العمل", "Kind of work")}
            <select name="kind" required className={field} defaultValue={canal ? "canal" : "harvest"}>
              {Object.entries(kinds).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("عنوان الدعوة", "Title of the call")}
            <input name="title" required minLength={5} maxLength={120} className={field} placeholder={t("حصاد سمسم عشرين فداناً في الحواتة", "Harvesting 20 feddans of sesame in Al-Hawata")} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("التفاصيل", "Details")}
            <textarea name="description" required minLength={10} maxLength={1500} rows={4} className={field} placeholder={t("ما العمل بالضبط، ومتى يبدأ، وأين نلتقي", "What exactly the work is, when it starts, and where we meet")} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("الولاية", "State")}
              <select name="state" required className={field} defaultValue="">
                <option value="" disabled>{t("اختر", "Choose")}</option>
                {SUDAN_STATES.map((s) => <option key={s} value={s}>{stateName(s, locale)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("المحلية أو القرية", "Locality or village")}
              <input name="locality" required minLength={2} maxLength={80} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("اليوم", "Day")}
              <input type="date" name="starts_on" required min={tomorrow.slice(0, 10)} defaultValue={tomorrow} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("كم يداً تحتاج؟", "How many hands do you need?")}
              <input type="number" name="needed" required min={1} max={500} defaultValue={10} className={field} />
            </label>
          </div>
          {canals.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              {t("اربط الدعوة بترعة", "Link the call to a canal")}{" "}
              <span className="text-xs text-muted">{t("(اختياري — تظهر في صفحة الترعة)", "(optional — it will show on the canal’s page)")}</span>
              <select name="canal_id" className={field} defaultValue={canals.some((c) => c.id === canal) ? canal : ""}>
                <option value="">—</option>
                {canals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            {t("ما تقدّمه للملبّين", "What you offer those who come")}{" "}
            <span className="text-xs text-muted">{t("(اختياري — الفطور، الغداء، الماء…)", "(optional — breakfast, lunch, water…)")}</span>
            <input name="hosting" maxLength={200} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("ما يحمله الملبّي معه", "What helpers should bring")}{" "}
            <span className="text-xs text-muted">{t("(اختياري — منجل، طورية، كوريك…)", "(optional — sickle, hoe, shovel…)")}</span>
            <input name="bring_tools" maxLength={200} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("الاسم الذي يظهر على الدعوة", "Name shown on the call")}
            <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
          </label>
          <button className={`${button} self-start`}>{t("انشر الدعوة", "Post the call")}</button>
        </form>
      )}
    </NafirShell>
  );
}
