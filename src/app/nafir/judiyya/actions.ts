"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

const msg = (m?: string) =>
  m && /[؀-ۿ]/.test(m) ? m : "تعذّرت الخطوة. راجع الحقول وأعد المحاولة.";

export async function volunteer(fd: FormData) {
  const supabase = await client();
  const state = str(fd, "state");
  if (!(SUDAN_STATES as readonly string[]).includes(state)) back("/nafir/judiyya", "error", "اختر الولاية.");
  const { error } = await supabase.rpc("judiyya_volunteer", {
    p_name: str(fd, "display_name"),
    p_state: state,
    p_about: str(fd, "about"),
  });
  if (error) back("/nafir/judiyya", "error", msg(error.message));
  back("/nafir/judiyya", "ok", "سُجّلت أجويداً. تتحقّق منك الإدارة، ثمّ يمكن أن يختارك المتنازعون.");
}

export async function verifyMediator(fd: FormData) {
  const supabase = await client();
  const { error } = await supabase.rpc("judiyya_verify_mediator", { p_user: str(fd, "user_id") });
  if (error) back("/nafir/judiyya", "error", msg(error.message));
  back("/nafir/judiyya", "ok", "تُحقِّق من الأجويد.");
}

export async function openCase(fd: FormData) {
  const supabase = await client();
  const kind = str(fd, "kind");
  const state = str(fd, "state");
  if (!(kind in JUDIYYA_KINDS)) back("/nafir/judiyya", "error", "اختر نوع النزاع.");
  if (!(SUDAN_STATES as readonly string[]).includes(state)) back("/nafir/judiyya", "error", "اختر الولاية.");
  if (!fd.get("understood")) back("/nafir/judiyya", "error", "أكّد أنك قرأت ما الجودية وما ليست.");
  const { data, error } = await supabase.rpc("judiyya_open", {
    p_kind: kind,
    p_title: str(fd, "title"),
    p_summary: str(fd, "summary"),
    p_state: state,
    p_locality: str(fd, "locality"),
    p_name: str(fd, "display_name"),
  });
  if (error || !data) back("/nafir/judiyya", "error", msg(error?.message));
  back(`/nafir/judiyya/${data}`, "ok", "فُتح الطلب. أرسل رابط الدعوة إلى الطرف الآخر.");
}

export async function joinCase(fd: FormData) {
  const supabase = await client();
  const token = str(fd, "token");
  const { data, error } = await supabase.rpc("judiyya_join", {
    p_token: token,
    p_name: str(fd, "display_name"),
  });
  if (error || !data) back(`/nafir/judiyya/join/${token}`, "error", msg(error?.message));
  back(`/nafir/judiyya/${data}`, "ok", "دخلتَ الطلب. الخطوة التالية: الالتزام بقبول الحكم.");
}

async function step(fd: FormData, fn: string, args: Record<string, unknown>, ok: string) {
  const supabase = await client();
  const id = str(fd, "case_id");
  const { error } = await supabase.rpc(fn, { p_case: id, ...args });
  if (error) back(`/nafir/judiyya/${id}`, "error", msg(error.message));
  back(`/nafir/judiyya/${id}`, "ok", ok);
}

export async function commit(fd: FormData) {
  await step(fd, "judiyya_commit", {}, "التزمتَ بقبول الحكم قبل سماعه.");
}

export async function approve(fd: FormData) {
  await step(
    fd,
    "judiyya_approve",
    { p_mediator: str(fd, "mediator_id"), p_on: str(fd, "on") === "1" },
    str(fd, "on") === "1" ? "رضيتَ هذا الأجويد." : "سحبتَ رضاك.",
  );
}

export async function accept(fd: FormData) {
  await step(fd, "judiyya_accept", {}, "قبلتَ الوساطة. جزاك الله خيراً.");
}

export async function writeSettlement(fd: FormData) {
  await step(
    fd,
    "judiyya_write_settlement",
    { p_text: str(fd, "settlement"), p_name: str(fd, "settlement_name") },
    "كُتب الصلح، وبلغ الطرفين ليُقرّاه.",
  );
}

export async function confirm(fd: FormData) {
  await step(fd, "judiyya_confirm", {}, "أقررتَ الصلح.");
}

export async function withdraw(fd: FormData) {
  await step(fd, "judiyya_withdraw", {}, "سُحب الطلب.");
}
