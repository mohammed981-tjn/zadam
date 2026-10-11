"use server";
import { dbMessage as translateDb } from "@/lib/dbMessages";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { JUDIYYA_KINDS, SUDAN_STATES } from "@/lib/nafir";

/**
 * Every step of a judiyya is a database function (supabase/migrations/
 * 20260925120000_judiyya.sql) that checks the step and who takes it; these
 * actions only carry the form to it and bring the result back as ?ok= or
 * ?error=. The functions' refusals are written in Arabic for the person, so
 * they are shown as they are.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function client() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/nafir/judiyya", "layout");
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

async function tx() {
  const locale = await getLocale();
  return (ar: string, en: string) => tr(locale, ar, en);
}

const msg = (t: (ar: string, en: string) => string, m?: string) =>
  m && /[؀-ۿ]/.test(m) ? translateDb(m, t("ar", "en") === "en" ? "en" : "ar") : t("تعذّرت الخطوة. راجع الحقول وأعد المحاولة.", "That step failed. Check the fields and try again.");

export async function volunteer(fd: FormData) {
  const supabase = await client();
  const t = await tx();
  const state = str(fd, "state");
  if (!(SUDAN_STATES as readonly string[]).includes(state)) back("/nafir/judiyya", "error", t("اختر الولاية.", "Choose the state."));
  const { error } = await supabase.rpc("judiyya_volunteer", {
    p_name: str(fd, "display_name"),
    p_state: state,
    p_about: str(fd, "about"),
  });
  if (error) back("/nafir/judiyya", "error", msg(t, error.message));
  back("/nafir/judiyya", "ok", t("سُجّلت أجويداً. تتحقّق منك الإدارة، ثمّ يمكن أن يختارك المتنازعون.", "You are registered as a mediator (ajwad). Once the administration verifies you, parties to a dispute can choose you."));
}

export async function verifyMediator(fd: FormData) {
  const supabase = await client();
  const t = await tx();
  const { error } = await supabase.rpc("judiyya_verify_mediator", { p_user: str(fd, "user_id") });
  if (error) back("/nafir/judiyya", "error", msg(t, error.message));
  back("/nafir/judiyya", "ok", t("تُحقِّق من الأجويد.", "The mediator is verified."));
}

export async function openCase(fd: FormData) {
  const supabase = await client();
  const t = await tx();
  const kind = str(fd, "kind");
  const state = str(fd, "state");
  if (!(kind in JUDIYYA_KINDS)) back("/nafir/judiyya", "error", t("اختر نوع النزاع.", "Choose the kind of dispute."));
  if (!(SUDAN_STATES as readonly string[]).includes(state)) back("/nafir/judiyya", "error", t("اختر الولاية.", "Choose the state."));
  if (!fd.get("understood")) back("/nafir/judiyya", "error", t("أكّد أنك قرأت ما الجودية وما ليست.", "Confirm that you have read what judiyya is and what it is not."));
  const { data, error } = await supabase.rpc("judiyya_open", {
    p_kind: kind,
    p_title: str(fd, "title"),
    p_summary: str(fd, "summary"),
    p_state: state,
    p_locality: str(fd, "locality"),
    p_name: str(fd, "display_name"),
  });
  if (error || !data) back("/nafir/judiyya", "error", msg(t, error?.message));
  back(`/nafir/judiyya/${data}`, "ok", t("فُتح الطلب. أرسل رابط الدعوة إلى الطرف الآخر.", "The case is open. Send the invitation link to the other party."));
}

export async function joinCase(fd: FormData) {
  const supabase = await client();
  const t = await tx();
  const token = str(fd, "token");
  const { data, error } = await supabase.rpc("judiyya_join", {
    p_token: token,
    p_name: str(fd, "display_name"),
  });
  if (error || !data) back(`/nafir/judiyya/join/${token}`, "error", msg(t, error?.message));
  back(`/nafir/judiyya/${data}`, "ok", t("دخلتَ الطلب. الخطوة التالية: الالتزام بقبول الحكم.", "You have joined the case. Next step: committing to accept the ruling."));
}

async function step(fd: FormData, fn: string, args: Record<string, unknown>, ok: [string, string]) {
  const supabase = await client();
  const t = await tx();
  const id = str(fd, "case_id");
  const { error } = await supabase.rpc(fn, { p_case: id, ...args });
  if (error) back(`/nafir/judiyya/${id}`, "error", msg(t, error.message));
  back(`/nafir/judiyya/${id}`, "ok", t(...ok));
}

export async function commit(fd: FormData) {
  await step(fd, "judiyya_commit", {}, ["التزمتَ بقبول الحكم قبل سماعه.", "You have committed to accept the ruling before hearing it."]);
}

export async function approve(fd: FormData) {
  await step(
    fd,
    "judiyya_approve",
    { p_mediator: str(fd, "mediator_id"), p_on: str(fd, "on") === "1" },
    str(fd, "on") === "1" ? ["رضيتَ هذا الأجويد.", "You approved this mediator."] : ["سحبتَ رضاك.", "You withdrew your approval."],
  );
}

export async function accept(fd: FormData) {
  await step(fd, "judiyya_accept", {}, ["قبلتَ الوساطة. جزاك الله خيراً.", "You accepted the mediation. May God reward you."]);
}

export async function writeSettlement(fd: FormData) {
  await step(
    fd,
    "judiyya_write_settlement",
    { p_text: str(fd, "settlement"), p_name: str(fd, "settlement_name") },
    ["كُتب الصلح، وبلغ الطرفين ليُقرّاه.", "The settlement is written, and both parties have been asked to confirm it."],
  );
}

export async function confirm(fd: FormData) {
  await step(fd, "judiyya_confirm", {}, ["أقررتَ الصلح.", "You confirmed the settlement."]);
}

export async function withdraw(fd: FormData) {
  await step(fd, "judiyya_withdraw", {}, ["سُحب الطلب.", "The case is withdrawn."]);
}
