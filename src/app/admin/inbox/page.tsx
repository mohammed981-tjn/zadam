import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import { loadAdminQueue } from "@/lib/adminQueue";
import { INVESTOR_MODEL_LABEL, type InvestorModel } from "@/lib/investors";
import { lbl } from "@/lib/partners";
import { card } from "@/lib/ui";

export const metadata = { title: "قائمة المراجعة | سوداقري" };

const date = (iso: string | null, locale: string) =>
  iso
    ? new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { day: "numeric", month: "long" })
    : "";

/**
 * قائمةُ المراجعة (البند ١٢٤) — the administrator's one place.
 *
 * Every queue in the product with its count, the oldest items first, and the
 * screen where each is decided. The decisions stay on those screens — they
 * carry the documents, the reasons and the guards — and this page only makes
 * sure nothing waits unseen. See `src/lib/adminQueue.ts` for why each «waiting»
 * condition is the one it is.
 */
export default async function AdminInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const sections = await loadAdminQueue(supabase);
  const decide = sections.filter((s) => !s.info);
  const total = decide.reduce((a, s) => a + (s.count ?? 0), 0);
  const waiting = sections.filter((s) => (s.count ?? 0) > 0);
  const clear = sections.filter((s) => s.count === 0);
  const failed = sections.filter((s) => s.count === null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader icon="shield" eyebrow={t("الإدارة", "Administration")} title={t("قائمة المراجعة", "Review list")}>
        {t(
          "كلّ ما ينتظر قرار الإدارة في مكانٍ واحد: الأراضي والفرص ومقدّمو الخدمة والموردون والشركات والصادر والنفير. الأقدم أوّلاً، والقرار في صفحة كلّ قسم.",
          "Everything waiting for an administrator, in one place: land, opportunities, providers, suppliers, companies, export and nafir. Oldest first; each is decided on its own screen.",
        )}
      </PageHeader>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-primary p-4 text-primary-foreground shadow-card">
          <p className="text-xs font-bold opacity-90">{t("ينتظر قرارك", "Waiting for you")}</p>
          <p className="text-3xl font-black">{total.toLocaleString(locale === "en" ? "en-US" : "ar-EG")}</p>
        </div>
        <div className={card}>
          <p className="text-xs font-bold text-muted">{t("أقسامٌ فيها انتظار", "Sections with items")}</p>
          <p className="text-3xl font-black text-primary">
            {waiting.filter((s) => !s.info).length.toLocaleString(locale === "en" ? "en-US" : "ar-EG")}
          </p>
        </div>
        <div className={`${card} col-span-2 sm:col-span-1`}>
          <p className="text-xs font-bold text-muted">{t("أقسامٌ خالية", "Clear sections")}</p>
          <p className="text-3xl font-black text-leaf">{clear.length.toLocaleString(locale === "en" ? "en-US" : "ar-EG")}</p>
        </div>
      </div>

      {waiting.length === 0 ? (
        <p className={`${card} text-center text-sm font-bold text-leaf`}>
          {t("لا شيء ينتظر — كلّ الأقسام خالية.", "Nothing is waiting — every section is clear.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {waiting.map((s) => (
            <li key={s.key} id={s.key} className={`${card} scroll-mt-24 ${s.info ? "" : "border-s-4 border-s-primary"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-black">
                    {lbl(s.title, locale)}{" "}
                    <span className={`ms-1 rounded-full px-2 py-0.5 text-xs font-black ${s.info ? "bg-border text-muted" : "bg-primary text-primary-foreground"}`}>
                      {(s.count ?? 0).toLocaleString(locale === "en" ? "en-US" : "ar-EG")}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">{lbl(s.what, locale)}</p>
                </div>
                {!s.info && (
                  <Link href={s.href} className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">
                    {t("افتح وقرّر", "Open and decide")}
                  </Link>
                )}
              </div>
              <ul className="mt-3 divide-y divide-border text-sm">
                {s.items.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                    {s.key.startsWith("messages_") ? (
                      <Link href={`/messages/${it.id}`} className="min-w-0 font-medium text-primary underline [overflow-wrap:anywhere]">
                        {it.title}
                      </Link>
                    ) : (
                      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{it.title}</span>
                    )}
                    <span className="text-xs text-muted">
                      {s.key === "investor_interests" && it.meta
                        ? lbl(INVESTOR_MODEL_LABEL[it.meta as InvestorModel] ?? { ar: it.meta, en: it.meta }, locale)
                        : it.meta}
                      {it.meta && it.at ? " · " : ""}
                      {date(it.at, locale)}
                    </span>
                  </li>
                ))}
              </ul>
              {(s.count ?? 0) > s.items.length && (
                <p className="mt-2 text-xs text-muted">
                  {t(`و${(s.count ?? 0) - s.items.length} غيرها في صفحة القسم.`, `And ${(s.count ?? 0) - s.items.length} more on the section's page.`)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {clear.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-bold text-muted">{t("خالية الآن", "Clear now")}</h2>
          <ul className="flex flex-wrap gap-2">
            {clear.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className="inline-block rounded-full bg-leaf/10 px-3 py-1 text-xs font-bold text-leaf hover:bg-leaf/15">
                  ✓ {lbl(s.title, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {failed.length > 0 && (
        <p className="mt-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs">
          {t("تعذّرت قراءة: ", "Could not read: ")}
          {failed.map((s) => lbl(s.title, locale)).join("، ")}
          {t(" — افتحها من صفحاتها.", " — open them from their pages.")}
        </p>
      )}
    </div>
  );
}
