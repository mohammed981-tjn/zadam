"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { isCurrency } from "@/lib/ledger/money";
import { parseStatementCsv, statementErrorMessage } from "@/lib/ledger/statementCsv";
import { PROVIDERS } from "@/lib/ledger/platformBook";

/**
 * مطابقة الحساب النقديّ بكشف مزوّده (البند ١٨٩). The file is read here (src/lib/ledger/statementCsv.ts) and its rows are
 * handed to `ledger_statement_import`, which checks the account is the caller's own cash account and matches what it can
 * (supabase/migrations/20261025210100_ledger_statements.sql). Nothing here writes in the book.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE = 1_000_000;

function back(fd: FormData, key: "ok" | "error", message: string): never {
  const q = new URLSearchParams();
  const book = str(fd, "book");
  const account = str(fd, "account");
  if (book === "farm" || book === "investor" || book === "platform") q.set("book", book);
  if (UUID.test(account)) q.set("a", account);
  q.set(key, message);
  revalidatePath("/books/reconcile");
  redirect(`/books/reconcile?${q.toString()}`);
}

export async function importStatement(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const account = str(fd, "account");
  if (!UUID.test(account)) back(fd, "error", t("اختر الحساب.", "Choose the account."));
  const currency = str(fd, "currency");
  if (!isCurrency(currency)) back(fd, "error", t("اختر عملة الكشف.", "Choose the statement's currency."));

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(fd, "error", t("اختر ملفّ الكشف (CSV).", "Choose the statement file (CSV)."));
  if (file.size > MAX_FILE) back(fd, "error", t("الملفّ أكبر من ميغابايت؛ قسّمه إلى فترات.", "The file is larger than a megabyte; split it by period."));

  const parsed = parseStatementCsv(await file.text(), currency);
  if (!parsed.ok) back(fd, "error", statementErrorMessage(parsed.error, t, parsed.badLines));

  const { data, error } = await supabase.rpc("ledger_statement_import", {
    p_account: account,
    p_currency: currency,
    p_file_name: file.name.slice(0, 120),
    p_rows: parsed.rows,
  });
  if (error) {
    console.error("importStatement failed", { error });
    back(fd, "error", explain(locale, error));
  }
  const r = ((data ?? []) as { imported: number; skipped: number; matched: number }[])[0] ?? { imported: 0, skipped: 0, matched: 0 };
  const notRead = parsed.skipped.length;
  back(
    fd,
    "ok",
    t(
      `رُفع ${r.imported} سطراً، وطوبق ${r.matched} منها آليّاً بقيود دفترك.` +
        (r.skipped ? ` و${r.skipped} كانت مرفوعةً من قبل فلم تتكرّر.` : "") +
        (notRead ? ` وتُرك ${notRead} سطراً بلا حركة أو لم يُقرأ (السطور: ${parsed.skipped.slice(0, 10).join("، ")}).` : ""),
      `${r.imported} rows uploaded, ${r.matched} of them matched automatically with your entries.` +
        (r.skipped ? ` ${r.skipped} were uploaded before and were not repeated.` : "") +
        (notRead ? ` ${notRead} rows had no movement or could not be read (lines: ${parsed.skipped.slice(0, 10).join(", ")}).` : ""),
    ),
  );
}

export async function matchLine(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("ledger_statement_match", {
    p_statement_line: str(fd, "statement_line"),
    p_journal_line: str(fd, "journal_line"),
  });
  if (error) back(fd, "error", explain(locale, error));
  back(fd, "ok", t("طوبق السطر بالقيد.", "The line was matched with the entry."));
}

export async function unmatchLine(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("ledger_statement_unmatch", { p_statement_line: str(fd, "statement_line") });
  if (error) back(fd, "error", explain(locale, error));
  back(fd, "ok", t("فُكّت المطابقة.", "The match was undone."));
}

export async function deleteStatement(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("ledger_statement_delete", { p_statement: str(fd, "statement_id") });
  if (error) back(fd, "error", explain(locale, error));
  back(fd, "ok", t("حُذف الكشف بسطوره. قيود دفترك كما هي.", "The statement and its lines were removed. Your entries are as they were."));
}

/** Which provider a cash account is with (Bankak, MTN…), so the right statement is laid against it. */
export async function setProvider(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const provider = str(fd, "provider");
  if (!PROVIDERS.some((p) => p.key === provider)) back(fd, "error", t("اختر المزوّد.", "Choose the provider."));
  const { error } = await supabase.rpc("ledger_account_set_provider", { p_account: str(fd, "account"), p_provider: provider });
  if (error) back(fd, "error", explain(locale, error));
  back(fd, "ok", t("حُفظ مزوّد الحساب.", "The account's provider was saved."));
}
