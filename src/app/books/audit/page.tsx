import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { BookPicker } from "@/components/books/JournalLinks";
import { AUDIT_ACTIONS, VIA, auditSummary } from "@/lib/ledger/journal";
import { loadAudit, readableBook } from "@/lib/ledger/journalLoad";

/**
 * سجلّ التدقيق (البند ٢٠٥): كلّ ما جرى في الدفتر — قيدٌ وسطوره وعكسه، وإعدادٌ واعتمادٌ وردٌّ وسحب، وإقفالٌ وإعادة فتح —
 * بمن فعله ومتى ومن أين وماذا. يُلحَق ولا يُعدَّل ولا يُحذف، حتى على المدير. يقرؤه صاحب الدفتر، ومديرٌ أثناء فحصٍ فتحه.
 */

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { book, own } = await readableBook(supabase, user.id, sp.book);
  const before = sp.before && /^\d+$/.test(sp.before) ? Number(sp.before) : null;
  const { rows, more } = book ? await loadAudit(supabase, book.id, before) : { rows: [], more: false };
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ar-SD", { timeZone: "Africa/Khartoum", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/books" className="text-sm text-primary underline">
        ← {t("دفتر الحسابات", "Books")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{t("سجلّ التدقيق", "Audit log")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "كلّ ما جرى في دفترك، بمن فعله ومتى ومن أين. يُكتب وحده مع كلّ قيدٍ واعتمادٍ وردٍّ وإقفال، ولا يُعدَّل ولا يُحذف — ولا تملك الإدارة ذلك أيضاً.",
          "Everything that happened in your book, with who did it, when and from where. It is written by itself with every entry, approval, return and closing, and is never changed or deleted — not by the administrators either.",
        )}
      </p>
      <BookPicker books={own.map((b) => ({ ...b, role: "owner" as const, owner_name: "" }))} current={book?.id ?? null} base="/books/audit" locale={locale} />
      {!book ? (
        <p className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">{t("لا دفتر لك بعد.", "You have no book yet.")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{t("لا شيء في السجلّ بعد.", "Nothing in the log yet.")}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t("متى", "When")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("ماذا", "What")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("من", "Who")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("من أين", "From")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("التفصيل", "Detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{when(r.at)}</td>
                  <td className="px-3 py-2">{AUDIT_ACTIONS[r.action] ? t(AUDIT_ACTIONS[r.action].ar, AUDIT_ACTIONS[r.action].en) : r.action}</td>
                  <td className="px-3 py-2">{r.actor_id === user.id ? t("أنت", "You") : r.actor_name || (r.actor_id ? t("مستخدم", "A user") : t("النظام", "The system"))}</td>
                  <td className="px-3 py-2">{VIA[r.via] ? t(VIA[r.via].ar, VIA[r.via].en) : r.via}</td>
                  <td className="px-3 py-2">{auditSummary(r, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && book && (
        <Link href={`/books/audit?book=${book.id}&before=${rows[rows.length - 1].id}`} className="mt-4 inline-block text-sm text-primary underline">
          {t("ما قبلها", "Earlier")}
        </Link>
      )}
    </div>
  );
}
