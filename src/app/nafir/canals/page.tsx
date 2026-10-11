import Link from "next/link";
import NafirShell, { button, field } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { SUDAN_STATES, ar, stateName, typed, type CanalSummary } from "@/lib/nafir";
import { createCanal } from "./actions";
import FilmPlayer from "@/components/FilmPlayer";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الترع | سوداقري", "Canals | Sudagri"),
    description: tr(
      locale,
      "الترعة موردٌ مشترك: أعضاؤها، ونوبات مائها، وواجب صيانتها بقدر فدادين كلٍّ منهم — ونفيرُ تطهيرها.",
      "A canal is a shared resource: its members, their watering turns, and each one’s share of its upkeep by the feddans it waters — and the nafir to clear it.",
    ),
  };
}

/**
 * The directory of canals: name, place, how many members and how much land —
 * enough to find yours and ask to join. Who the members are, and their turns,
 * stay inside the canal (the page for each one).
 */
export default async function CanalsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const n = (x: number) => ar(x, locale);
  const { supabase, user, name } = await nafirViewer();
  const { data } = await supabase.rpc("canal_directory");
  const canals = (data ?? []) as CanalSummary[];

  return (
    <NafirShell active="/nafir/canals" ok={ok} error={error}>
      <h1 className="text-2xl font-black">{t("الترع", "Canals")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "الترعة موردٌ مشترك: ماؤها لأهلها بنوبات، وصيانتها عليهم بقدر ما تسقي لكلٍّ منهم. هكذا تبقى — ودرس مشروع الجزيرة أنّ الترعة التي يتولّى أهلُها صيانتها زادت غلّتها أضعافاً. سجّل ترعتك، واقبل جيرانك أعضاءً، واكتب جدول النوبات، وادعُ إلى نفير تطهيرها.",
          "A canal is a shared resource: its water goes to its people in turns, and its upkeep falls on them in proportion to what it waters for each. That is how it lasts — and the lesson of the Gezira Scheme is that canals maintained by their own users yielded several times more. Register your canal, accept your neighbours as members, write the watering schedule, and call a nafir to clear it.",
        )}
      </p>

      <figure className="my-6">
        <FilmPlayer base="/video/canals-wide" poster="/video/canals-wide.jpg" label={t("فيلم سوداقري: نفير تطهير الترعة", "A Sudagri film: the nafir to clear the canal")} />
      </figure>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {canals.length === 0 && (
          <li className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">{t("لا ترعة مسجّلة بعد.", "No canals registered yet.")}</li>
        )}
        {canals.map((c) => (
          <li key={c.id}>
            <Link href={`/nafir/canals/${c.id}`} className="flex h-full flex-col gap-1 rounded-2xl border border-border bg-card p-4 hover:border-primary">
              <span className="font-bold" {...typed(locale)}>{c.name}</span>
              <span className="text-xs text-muted">
                {stateName(c.state, locale)} — <bdi>{c.locality}</bdi>
              </span>
              {c.description && <span className="text-sm text-muted" {...typed(locale)}>{c.description}</span>}
              <span className="figure mt-auto text-sm">
                {locale === "en"
                  ? `${n(Number(c.members))} members · ${n(Number(c.feddans))} feddans`
                  : `${n(Number(c.members))} عضواً · ${n(Number(c.feddans))} فدان`}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <h2 className="text-lg font-bold">{t("سجّل ترعتك", "Register your canal")}</h2>
        {!user ? (
          <p className="mt-2 text-sm">
            <Link href="/login" className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
            {t("لتسجّل ترعة.", "to register a canal.")}
          </p>
        ) : (
          <form action={createCanal} className="mt-3 flex flex-col gap-3">
            <input
              name="name"
              required
              minLength={3}
              maxLength={80}
              className={field}
              placeholder={t("اسم الترعة أو الميسقة: ميسقة ٧ — الحصاحيصا", "Canal or field-channel (misga) name: Misga 7 — Al-Hasaheisa")}
              aria-label={t("اسم الترعة", "Canal name")}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="state" required className={field} defaultValue="" aria-label={t("الولاية", "State")}>
                <option value="" disabled>{t("الولاية", "State")}</option>
                {SUDAN_STATES.map((s) => <option key={s} value={s}>{stateName(s, locale)}</option>)}
              </select>
              <input
                name="locality"
                required
                minLength={2}
                maxLength={80}
                className={field}
                placeholder={t("المحلية أو القرية", "Locality or village")}
                aria-label={t("المحلية أو القرية", "Locality or village")}
              />
            </div>
            <textarea
              name="description"
              maxLength={1000}
              rows={2}
              className={field}
              placeholder={t("وصفٌ قصير (اختياري): من أين تأخذ، وكم تسقي", "Short description (optional): where it draws from, and how much it waters")}
              aria-label={t("وصف", "Description")}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                {t("اسمك كما يراه الأعضاء", "Your name as members will see it")}
                <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("فدادينك التي تسقيها", "Feddans it waters for you")}
                <input type="number" name="feddans" required min={0.25} max={10000} step={0.25} className={field} />
              </label>
            </div>
            <p className="text-xs text-muted">
              {t(
                "مَن يسجّل الترعة يكون قيّمها: يقبل الأعضاء، ويثبّت فدادينهم، ويكتب الجدول. ويمكنه أن يجعل غيره قيّماً معه.",
                "Whoever registers the canal becomes its steward: they accept members, confirm their feddans and write the schedule, and can make others stewards too.",
              )}
            </p>
            <button className={`${button} self-start`}>{t("سجّل الترعة", "Register the canal")}</button>
          </form>
        )}
      </section>
    </NafirShell>
  );
}
