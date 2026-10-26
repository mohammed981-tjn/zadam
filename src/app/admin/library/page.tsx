import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { RESEARCH_KIND_LABEL, type ResearchKind } from "@/lib/research";
import { reviewResearch } from "./actions";

type Pending = {
  id: string;
  kind: ResearchKind;
  title: string;
  authors: string;
  institution: string | null;
  year: number | null;
  crop: string | null;
  state: string | null;
  abstract: string;
  file_path: string | null;
  link_url: string | null;
  contact: string | null;
  submitted_by: string | null;
  created_at: string;
};

/**
 * مراجعة مكتبة الدراسات (البند ٢٠٢): ما ينتظر، بملفّه أو رابطه ووسيلة تواصل مرسِله، ونشرُه أو ردّه بسبب.
 * What to check before publishing: that it is about farming in Sudan, that the file opens and is the work described,
 * and that nothing in it is someone else's private data.
 */
export default async function AdminLibraryPage({ searchParams }: PageProps<"/admin/library">) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/library");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const { data, error } = await supabase.rpc("research_pending");
  if (error) console.error("admin/library: pending failed", error.message);
  const pending = (data ?? []) as Pending[];

  // The files are in a private bucket; a signed link for an hour lets the reviewer open each one.
  const admin = createAdminClient();
  const links = new Map<string, string>();
  if (admin) {
    for (const p of pending) {
      if (!p.file_path) continue;
      const { data: s } = await admin.storage.from("research").createSignedUrl(p.file_path, 3600);
      if (s?.signedUrl) links.set(p.id, s.signedUrl);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/admin" className="text-sm text-primary underline">
        {t("→ لوحة الإدارة", "← Admin")}
      </Link>
      <h1 className="mt-4 font-black" style={{ fontSize: "var(--text-title)" }}>
        {t("مكتبة الدراسات: ما ينتظر المراجعة", "Library: waiting for review")}
      </h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "قبل النشر: أنّه عن الزراعة في السودان، وأنّ الملفّ يُفتح وهو العمل الموصوف، وأنّه لا يكشف بيانات أحدٍ الخاصّة. والردّ بسببٍ يقرؤه المرسِل.",
          "Before publishing: that it concerns farming in Sudan, that the file opens and is the work described, and that it exposes no one's private data. A return carries a reason the sender reads.",
        )}
      </p>
      {typeof sp.ok === "string" && <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm">{sp.ok}</p>}
      {typeof sp.error === "string" && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{sp.error}</p>}

      {pending.length === 0 ? (
        <p className="mt-8 text-muted">{t("لا شيء ينتظر.", "Nothing is waiting.")}</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {pending.map((p) => (
            <li key={p.id} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs text-muted">
                {tr(locale, ...RESEARCH_KIND_LABEL[p.kind])}
                {p.crop && ` · ${p.crop}`}
                {p.state && ` · ${p.state}`} · {new Date(p.created_at).toLocaleDateString("en-GB")}
              </p>
              <p className="mt-1 text-lg font-black">{p.title}</p>
              <p className="text-sm text-muted">
                {p.authors}
                {p.institution && ` · ${p.institution}`}
                {p.year && ` · ${p.year}`}
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-7">{p.abstract}</p>
              <p className="mt-3 flex flex-wrap gap-3 text-sm">
                {links.get(p.id) && (
                  <a href={links.get(p.id)} target="_blank" rel="noopener" className="text-primary underline">
                    {t("افتح الملفّ", "Open the file")}
                  </a>
                )}
                {p.link_url && (
                  <a href={p.link_url} target="_blank" rel="noopener nofollow" className="text-primary underline">
                    {t("افتح الرابط", "Open the link")}
                  </a>
                )}
                <span className="text-muted">
                  {t("التواصل: ", "Contact: ")}
                  {p.contact ?? t("لم يترك", "none left")} · {p.submitted_by ? t("عضو مسجَّل", "a member") : t("زائر", "a visitor")}
                </span>
              </p>
              <form action={reviewResearch} className="mt-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input
                  name="note"
                  maxLength={500}
                  placeholder={t("سبب الردّ (يُلزم عند الردّ)", "Reason for returning (required to return)")}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <button name="decision" value="publish" className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                  {t("انشر", "Publish")}
                </button>
                <button name="decision" value="reject" className="rounded-xl border border-border px-4 py-2 text-sm font-bold">
                  {t("ردّ بالسبب", "Return with reason")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
