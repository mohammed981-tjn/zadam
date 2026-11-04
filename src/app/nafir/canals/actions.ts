"use server";
import { dbMessage as translateDb } from "@/lib/dbMessages";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { SUDAN_STATES } from "@/lib/nafir";

/**
 * Every canal step is a database function (supabase/migrations/
 * 20260925140000_canals.sql) that checks who is taking it. These actions
 * carry the form there and bring the result back as ?ok= / ?error=.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function client() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  return supabase;
}

function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/nafir/canals", "layout");
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

async function tx() {
  const locale = await getLocale();
  return (ar: string, en: string) => tr(locale, ar, en);
}

const msg = (t: (ar: string, en: string) => string, m?: string) =>
  m && /[؀-ۿ]/.test(m) ? translateDb(m, t("ar", "en") === "en" ? "en" : "ar") : t("تعذّرت الخطوة. راجع الحقول وأعد المحاولة.", "That step failed. Check the fields and try again.");

const feddans = (fd: FormData, k = "feddans") => {
  const n = Number(str(fd, k));
  return Number.isFinite(n) && n > 0 && n <= 10000 ? n : null;
};

export async function createCanal(fd: FormData) {
  const supabase = await client();
  const t = await tx();
  const state = str(fd, "state");
  const f = feddans(fd);
  if (!(SUDAN_STATES as readonly string[]).includes(state)) back("/nafir/canals", "error", t("اختر الولاية.", "Choose the state."));
  if (f === null) back("/nafir/canals", "error", t("اكتب فدادينك التي تسقيها الترعة.", "Enter the feddans the canal waters for you."));
  const { data, error } = await supabase.rpc("canal_create", {
    p_name: str(fd, "name"),
    p_state: state,
    p_locality: str(fd, "locality"),
    p_description: str(fd, "description"),
    p_display_name: str(fd, "display_name"),
    p_feddans: f,
  });
  if (error || !data) back("/nafir/canals", "error", msg(t, error?.message));
  back(`/nafir/canals/${data}`, "ok", t("سُجّلت الترعة، وأنت قيّمها. ادعُ جيرانك إليها.", "The canal is registered, and you are its steward. Invite your neighbours to join."));
}

async function step(fd: FormData, fn: string, args: Record<string, unknown>, ok: [string, string]) {
  const supabase = await client();
  const t = await tx();
  const id = str(fd, "canal_id");
  const { error } = await supabase.rpc(fn, { p_canal: id, ...args });
  if (error) back(`/nafir/canals/${id}`, "error", msg(t, error.message));
  back(`/nafir/canals/${id}`, "ok", t(...ok));
}

export async function requestJoin(fd: FormData) {
  const t = await tx();
  const f = feddans(fd);
  if (f === null) back(`/nafir/canals/${str(fd, "canal_id")}`, "error", t("اكتب فدادينك التي تسقيها الترعة.", "Enter the feddans the canal waters for you."));
  await step(fd, "canal_request_join", { p_display_name: str(fd, "display_name"), p_feddans: f },
    ["أُرسل طلبك إلى قيّم الترعة.", "Your request has been sent to the canal’s steward."]);
}

export async function decide(fd: FormData) {
  const accept = str(fd, "accept") === "1";
  await step(
    fd,
    "canal_decide",
    { p_user: str(fd, "user_id"), p_accept: accept, p_feddans: feddans(fd) },
    accept ? ["قُبل العضو.", "The member is accepted."] : ["رُدّ الطلب.", "The request is declined."],
  );
}

export async function setMember(fd: FormData) {
  const t = await tx();
  const f = feddans(fd);
  if (f === null) back(`/nafir/canals/${str(fd, "canal_id")}`, "error", t("الفدادين عددٌ أكبر من صفر.", "Feddans must be a number greater than zero."));
  await step(
    fd,
    "canal_set_member",
    { p_user: str(fd, "user_id"), p_feddans: f, p_role: str(fd, "role") === "steward" ? "steward" : "member" },
    ["عُدّل العضو.", "The member is updated."],
  );
}

export async function leave(fd: FormData) {
  await step(fd, "canal_leave", {}, ["غادرتَ الترعة.", "You have left the canal."]);
}

/**
 * The schedule arrives as rows of the same four fields; blank rows are the
 * empty slots at the bottom of the form and are dropped here, so a steward
 * never has to delete a row to leave it unused.
 */
export async function setTurns(fd: FormData) {
  const users = fd.getAll("t_user").map(String);
  const days = fd.getAll("t_day").map(String);
  const starts = fd.getAll("t_starts").map(String);
  const ends = fd.getAll("t_ends").map(String);
  const turns = users
    .map((u, i) => ({ user_id: u, weekday: Number(days[i]), starts: starts[i], ends: ends[i] }))
    .filter((t) => t.user_id && t.starts && t.ends && Number.isInteger(t.weekday));
  await step(fd, "canal_set_turns", { p_turns: turns }, ["حُفظ جدول النوبات.", "The watering schedule is saved."]);
}
