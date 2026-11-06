/**
 * ما يكتبه صاحب الموسم: قيد المصروف أو الإيراد، ودليل المرحلة، واعتماد المرحلة (البند ٢٠٣).
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
import { evidenceFileExists } from "./evidenceFile";
import { sanitisePhotoMetadata } from "./exif";
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
}

/**
 * `invalid` is a form that names no season or no known category: the website has always ignored it without a word
 * (no field of its own form can send that), and still does; the app is told.
 */
export type SeasonWriteResult = { ok: true } | { ok: false; code: "invalid" | "refused"; message: string };

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

  const { error } = await supabase.from("ledger_entries").insert({
    season_id: seasonId,
    stage_id: stageId,
    category,
    ...parsed.money,
    description: f.description.trim() || null,
    entry_date: entryDate ?? today,
    created_by: userId,
  });

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

/** The kinds the website's action accepts for a stage's evidence; its form offers the first three. */
export const STAGE_EVIDENCE_KINDS: readonly string[] = ["photo", "invoice", "inspection", "note"];

/**
 * Records a file already uploaded to storage as evidence for a stage — the website's «ارفع الدليل» and the app's
 * «أضف دليلاً» (backlog 203), each with the uploader's own client.
 *
 * The path is verified to sit under this user's own folder before it is stored, so a crafted request cannot attach
 * someone else's object — the storage policy stops the upload, and this stops the reference. Whether the stage is the
 * caller's to add to is row-level security's answer (and stage_evidence_insert_gate's), given back in words.
 */
export async function addStageEvidence(
  supabase: SupabaseClient,
  userId: string,
  args: { stageId: string; kind: string; storagePath: string; caption: string; metadata?: unknown },
  locale: Locale,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = (ar: string, en: string) => tr(locale, ar, en);

  if (!args.stageId || !args.storagePath) {
    return { ok: false, message: t("بيانات الدليل ناقصة.", "The evidence details are incomplete.") };
  }
  if (!STAGE_EVIDENCE_KINDS.includes(args.kind)) {
    return { ok: false, message: t("نوع دليل غير معروف.", "Unknown evidence type.") };
  }
  if (!args.storagePath.startsWith(`${userId}/`)) {
    return { ok: false, message: t("مسار ملف غير صالح.", "Invalid file path.") };
  }

  // The row must point at a file that is actually there. See lib/evidenceFile
  // for why a failure to confirm is treated as a failure to upload.
  if (!(await evidenceFileExists(supabase, args.storagePath))) {
    return {
      ok: false,
      message: t(
        "لم نجد الملف المرفوع. أعد رفعه ثم حاول مرة أخرى.",
        "We could not find the uploaded file. Upload it again and try once more.",
      ),
    };
  }

  // A photo kept offline is sent again if the reply to its first send was lost (backlog 185): the same file on the
  // same stage is the evidence already recorded, not a second piece of it.
  const { data: already } = await supabase
    .from("stage_evidence")
    .select("id")
    .eq("stage_id", args.stageId)
    .eq("storage_path", args.storagePath)
    .limit(1)
    .maybeSingle();
  if (already) return { ok: true };

  const photo = sanitisePhotoMetadata(args.metadata);

  const { error } = await supabase.from("stage_evidence").insert({
    stage_id: args.stageId,
    kind: args.kind,
    caption: args.caption,
    storage_path: args.storagePath,
    captured_at: photo.capturedAt,
    latitude: photo.latitude,
    longitude: photo.longitude,
    created_by: userId,
  });

  if (error) return { ok: false, message: dbMessage(error.message, locale) };
  return { ok: true };
}

/**
 * Whether the stage is one of this season's, as the caller can read it. The app names both in its address and asks
 * before a photo is stored, so a stage of another season (or of a season the caller cannot see) leaves no file behind.
 */
export async function isStageOfSeason(supabase: SupabaseClient, stageId: string, seasonId: string): Promise<boolean> {
  const { data } = await supabase.from("season_stages").select("id").eq("id", stageId).eq("season_id", seasonId).maybeSingle();
  return Boolean(data);
}
