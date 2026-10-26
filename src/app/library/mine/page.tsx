import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { RESEARCH_KIND_LABEL, type ResearchKind } from "@/lib/research";

type Mine = {
  id: string;
  kind: ResearchKind;
  title: string;
  status: "pending" | "published" | "rejected";
  review_note: string | null;
  created_at: string;
};

/** «ما أرسلتُه» (البند ٢٠٢): ما أرسله المسجَّل إلى المكتبة وحاله، وسبب الردّ إن رُدّ. */
export default async function LibraryMinePage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = user ? await supabase.rpc("research_mine") : { data: null };
  const mine = (data ?? []) as Mine[];
  const state: Record<Mine["status"], [string, string]> = {
    pending: ["ينتظر المراجعة", "Awaiting review"],
    published: ["منشور", "Published"],
    rejected: ["رُدّ", "Returned"],
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/library" className="text-sm text-primary underline">
        {t("→ مكتبة الدراسات والبحوث", "← Studies and research library")}
      </Link>
      <h1 className="mt-4 font-black" style={{ fontSize: "var(--text-title)" }}>
        {t("ما أرسلتُه إلى المكتبة", "What I sent to the library")}
      </h1>
      {!user ? (
        <p className="mt-4 leading-8 text-muted">
          {t(
            "ما يرسله الزائر بلا حساب لا يُتابَع من هنا؛ ",
            "What a visitor sends without an account cannot be followed here; ",
          )}
          <Link href="/login?next=/library/mine" className="text-primary underline">
            {t("سجّل الدخول", "sign in")}
          </Link>
          {t(" لترى ما أرسلته بحسابك.", " to see what you sent with your account.")}
        </p>
      ) : mine.length === 0 ? (
        <p className="mt-4 text-muted">
          {t("لم ترسل شيئاً بعد. ", "You have not sent anything yet. ")}
          <Link href="/library/new" className="text-primary underline">
            {t("شارك دراستك", "Share your study")}
          </Link>
        </p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {mine.map((m) => (
            <li key={m.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted">
                {tr(locale, ...RESEARCH_KIND_LABEL[m.kind])} · {tr(locale, ...state[m.status])}
              </p>
              <p className="mt-1 font-bold">
                {m.status === "published" ? (
                  <Link href={`/library/${m.id}`} className="underline">
                    {m.title}
                  </Link>
                ) : (
                  m.title
                )}
              </p>
              {m.status === "rejected" && m.review_note && (
                <p className="mt-2 text-sm text-danger">
                  {t("السبب: ", "Reason: ")}
                  {m.review_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
