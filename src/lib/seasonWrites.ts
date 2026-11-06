/**
 * ما يكتبه صاحب الموسم: قيد المصروف أو الإيراد، واعتماد المرحلة (البند ٢٠٣).
 *
 * The website's server actions (src/app/seasons/actions.ts) and the phone app's routes (src/app/api/app/seasons/**)
 * both write through these, so the app checks exactly what the website checks: the same reading of the amount, the
 * currency, the rate and the day (`parseLedgerEntryInput`, `ledgerEntryDate`), the same refusal of a stage from
 * another season, the same insert, and the database's own refusals in the reader's language (`dbMessage`). Each takes
 * the client of the person writing — cookie-bound on the website, the app's bearer token on the phone — so row-level
 * security and the ledger's triggers decide, never a key of the server's.
 *
 * Nothing here redirects or revalidates: that is the website's business, done by its actions around the call.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dbMessage } from "./dbMessages";
import { ledgerEntryDate } from "./entryDate";
import { tr, type Locale } from "./i18n";
import { ledgerToday } from "./ledger/today";
import { ledgerEntryInputMessage, parseLedgerEntryInput } from "./ledgerEntryInput";
import type { LedgerCategory } from "./season";

export const LEDGER_CATEGORIES: readonly LedgerCategory[] = [
  "seeds",
  "fertiliser",
  "pesticide",
  "labour",
  "irrigation",
  "transport",
  "other",
  "revenue",
];

export const isLedgerCategory = (c: string): c is LedgerCategory => (LEDGER_CATEGORIES as readonly string[]).includes(c);

/** What the form sends, as text: the web form's fields, or the app's. */
export interface LedgerEntryFields {
  season_id: string;
  category: string;
  amount: string;
  currency: string;
  paid_from: string;
  fx_rate: string;
  description: string;
  entry_date: string;
  stage_id: string;
  /**
   * The random key the phone gave the entry when it was typed (`client_key`), the same on every attempt to send it.
   * Empty for a form sent before keys existed: it is saved as it always was.
   */
  client_key?: string;
}

/** The index that refuses a second row with the same (season, key): 20261106060000_ledger_client_key.sql. */
export const CLIENT_KEY_INDEX = "ledger_entries_season_client_key";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The entry's key as the column takes it, or null: anything that is not a UUID is no key (and no error). */
export function readClientKey(raw: string | undefined): string | null {
  const k = (raw ?? "").trim().toLowerCase();
  return UUID.test(k) ? k : null;
}

/**
 * The database's refusal of a second row with a key it already holds: the entry was saved by an earlier attempt whose
 * answer never reached the phone. Row-level security checks the row before the index does, so this can only be the
 * season owner's own entry — the same success as a first save.
 */
export function isAlreadySaved(error: { code?: string | null; message?: string | null; details?: string | null } | null): boolean {
  if (!error || error.code !== "23505") return false;
  return `${error.message ?? ""} ${error.details ?? ""}`.includes(CLIENT_KEY_INDEX);
}

/** PostgREST's «no such column» for the key: the code reached a database the migration has not reached yet. */
const keyColumnMissing = (error: { code?: string | null; message?: string | null }) =>
  (error.code === "PGRST204" || error.code === "42703") && (error.message ?? "").includes("client_key");

/**
 * `invalid` is a form that names no season or no known category: the website has always ignored it without a word
 * (no field of its own form can send that), and still does; the app is told.
 */
export type SeasonWriteResult =
  | { ok: true; /** Saved by an earlier attempt with the same key; nothing new was written. */ already?: boolean }
  | { ok: false; code: "invalid" | "refused"; message: string };

export async function recordLedgerEntry(
  supabase: SupabaseClient,
  userId: string,
  f: LedgerEntryFields,
  locale: Locale,
): Promise<SeasonWriteResult> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const seasonId = f.season_id.trim();
  const category = f.category.trim();
  if (!seasonId || !isLedgerCategory(category)) {
    return { ok: false, code: "invalid", message: t("اختر البند والموسم.", "Choose the item and the season.") };
  }

  /*
   * A ledger entry that fails silently is the worst of these: the page returns
   * as though the cost was recorded, and the book is quietly short by one line.
   * Nothing downstream can detect that later — there is no gap to find. So a figure
   * that cannot be read is sent back to the farmer with the reason, not dropped.
   */
  const parsed = parseLedgerEntryInput({
    amount: f.amount.trim(),
    currency: f.currency.trim(),
    paid_from: f.paid_from.trim(),
    fx_rate: f.fx_rate.trim(),
  });
  if (!parsed.ok) return { ok: false, code: "refused", message: ledgerEntryInputMessage(parsed.error, t) };

  // A cost kept on the phone while offline is sent later; it keeps the day it was written (backlog 167).
  // Without a day of its own the row takes Khartoum's today, sent explicitly: the column's default is the database's
  // UTC date, a day behind between midnight and two (review 198 B6).
  const today = ledgerToday();
  const entryDate = ledgerEntryDate(f.entry_date.trim(), today);

  // The stage a cost was for (backlog 190: the budget against the actual), when the farmer chose one. It must be a
  // stage of this season: the column only checks that the stage exists, so a stage from another season is refused
  // here rather than counted against a plan it is not part of. Revenue belongs to no stage.
  const stageChoice = category === "revenue" ? "" : f.stage_id.trim();
  let stageId: string | null = null;
  if (stageChoice) {
    const { data: stage } = await supabase
      .from("season_stages")
      .select("id")
      .eq("id", stageChoice)
      .eq("season_id", seasonId)
      .maybeSingle();
    if (!stage) {
      return {
        ok: false,
        code: "refused",
        message: t(
          "المرحلة المختارة ليست من مراحل هذا الموسم. لم يُحفظ شيء.",
          "The chosen stage is not one of this season's. Nothing was saved.",
        ),
      };
    }
    stageId = stageChoice;
  }

  const row = {
    season_id: seasonId,
    stage_id: stageId,
    category,
    ...parsed.money,
    description: f.description.trim() || null,
    entry_date: entryDate ?? today,
    created_by: userId,
  };
  // The same insert, with the key when the phone sent one: sending again after a lost answer is refused by the index
  // and read here as «already saved» (20261106060000). An entry with no key is written exactly as before.
  const clientKey = readClientKey(f.client_key);
  const keyed: typeof row & { client_key?: string } = clientKey ? { ...row, client_key: clientKey } : row;
  let { error } = await supabase.from("ledger_entries").insert(keyed);
  if (error && clientKey && keyColumnMissing(error)) {
    // The website went out before the migration: save the entry as before rather than lose it, and say so in the log.
    console.warn("addLedgerEntry: ledger_entries.client_key is missing; saved without the key", { seasonId });
    ({ error } = await supabase.from("ledger_entries").insert(row));
  }
  if (error && clientKey && isAlreadySaved(error)) return { ok: true, already: true };

  if (error) {
    console.error("addLedgerEntry failed", { seasonId, category, error });
    // The ledger's own refusals (no rate to take, a closed period) say exactly what to do; anything
    // else is the fixed sentence, and the details stay in the log.
    return {
      ok: false,
      code: "refused",
      message:
        dbMessage(error.message, locale) ||
        t("تعذّر تسجيل القيد. لم يُحفظ شيء — أعد المحاولة.", "Could not record the entry. Nothing was saved — please try again."),
    };
  }
  return { ok: true };
}

/**
 * Marks a stage done. The database trigger refuses if evidence is missing or an earlier stage is still open, and its
 * message is passed straight back so the farmer sees the real reason rather than a generic failure.
 *
 * `seasonId`, when given (the app names both in its address), must be the stage's season, and the row is read back to
 * say whether one was written (`changed`): row-level security filters a stage that is not the caller's without an
 * error. Without it — the website's form — the update is sent exactly as the page always sent it, and `changed` is
 * null (not asked).
 */
export async function signOffStage(
  supabase: SupabaseClient,
  args: { stageId: string; seasonId?: string },
  locale: Locale,
): Promise<{ ok: true; changed: boolean | null } | { ok: false; message: string }> {
  const update = supabase.from("season_stages").update({ completed: true, actual_end: ledgerToday() }).eq("id", args.stageId);
  if (!args.seasonId) {
    const { error } = await update;
    return error ? { ok: false, message: dbMessage(error.message, locale) } : { ok: true, changed: null };
  }
  const { data, error } = await update.eq("season_id", args.seasonId).select("id");
  if (error) return { ok: false, message: dbMessage(error.message, locale) };
  return { ok: true, changed: (data ?? []).length > 0 };
}
