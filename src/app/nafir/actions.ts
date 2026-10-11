"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import {
  CHARTER_VERSION,
  FAZA_CAUSES,
  FAZA_NEEDS,
  NAFIR_KINDS,
  PULSE_QUESTIONS,
  SUDAN_STATES,
  currentPeriod,
} from "@/lib/nafir";

/**
 * Every write in the /nafir section.
 *
 * Each action checks the obvious (signed in, fields present, values from the
 * closed lists) so a person gets a sentence rather than a Postgres error. It
 * does not re-implement the guards: who wrote a row, whether a call is still
 * open, who may mark a promise kept — the database triggers decide those, and
 * the gate in scripts/verify-nafir.sql proves they do. An error from them is
 * shown to the person as written, because they are written in Arabic for that.
 *
 * Results travel back as ?ok= / ?error= on a redirect, which works without
 * JavaScript and survives a reload.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function session(_back: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function done(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/nafir", "layout");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}

async function tx() {
  const locale = await getLocale();
  return (ar: string, en: string) => tr(locale, ar, en);
}

const isState = (s: string) => (SUDAN_STATES as readonly string[]).includes(s);
const dbMessage = (t: (ar: string, en: string) => string, m?: string) =>
  m && /[؀-ۿ]/.test(m) ? m : t("تعذّر الحفظ. راجع الحقول وأعد المحاولة.", "Could not save. Check the fields and try again.");

/* ───────────────────────── الميثاق ───────────────────────── */

export async function signCharter(fd: FormData) {
  const back = "/nafir/charter";
  const { supabase, user } = await session(back);
  const t = await tx();
  const role = str(fd, "role") === "leader" ? "leader" : "member";
  const display_name = str(fd, "display_name");
  const pledge = str(fd, "pledge") || null;
  const state = str(fd, "state") || null;
  if (display_name.length < 2) done(back, "error", t("اكتب الاسم الذي يظهر تحت توقيعك.", "Write the name to show under your signature."));
  if (state && !isState(state)) done(back, "error", t("اختر ولايةً من القائمة.", "Choose a state from the list."));
  if (!fd.get("agree")) done(back, "error", t("التوقيع يحتاج أن تؤكّد أنك قرأت الميثاق.", "To sign, confirm that you have read the charter."));

  const { error } = await supabase.from("charter_signatures").insert({
    user_id: user.id,
    charter_version: CHARTER_VERSION,
    role,
    display_name,
    pledge,
    state,
  });
  if (error?.code === "23505") done(back, "error", t("وقّعتَ هذا الميثاق من قبل.", "You have already signed this charter."));
  if (error) done(back, "error", dbMessage(t, error.message));
  done(
    back,
    "ok",
    role === "leader"
      ? t("وُقِّع الميثاق. سيظهر اسمك بين القادة، ويُتحقَّق منه قبل أن تُجيب في الشورى.", "The charter is signed. Your name will appear among the leaders, and it will be verified before you can answer in the shura.")
      : t("وُقِّع الميثاق. مرحباً بك في النفير.", "The charter is signed. Welcome to the nafir."),
  );
}

export async function withdrawSignature() {
  const back = "/nafir/charter";
  const { supabase, user } = await session(back);
  const t = await tx();
  await supabase
    .from("charter_signatures")
    .delete()
    .eq("user_id", user.id)
    .eq("charter_version", CHARTER_VERSION);
  done(back, "ok", t("سُحب توقيعك. الميثاق لا يُلزم مَن لم يختره.", "Your signature is withdrawn. The charter binds no one who has not chosen it."));
}

export async function verifyLeader(fd: FormData) {
  const back = "/nafir/charter";
  const { supabase } = await session(back);
  const t = await tx();
  const userId = str(fd, "user_id");
  const { data, error } = await supabase
    .from("charter_signatures")
    .update({ verified_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("charter_version", CHARTER_VERSION)
    .select("user_id");
  if (error || !data?.length) done(back, "error", t("لم يُتحقَّق — التحقّق للإدارة وحدها.", "Not verified — only the administration can verify."));
  done(back, "ok", t("تُحقِّق من القائد، وصار يستطيع الإجابة في الشورى.", "The leader is verified and can now answer in the shura."));
}

/* ───────────────────────── النفير ───────────────────────── */

export async function createCall(fd: FormData) {
  const back = "/nafir/new";
  const { supabase, user } = await session(back);
  const t = await tx();
  const kind = str(fd, "kind");
  const state = str(fd, "state");
  const needed = Number(str(fd, "needed"));
  if (!(kind in NAFIR_KINDS)) done(back, "error", t("اختر نوع العمل.", "Choose the kind of work."));
  if (!isState(state)) done(back, "error", t("اختر الولاية.", "Choose the state."));
  if (!Number.isInteger(needed) || needed < 1 || needed > 500)
    done(back, "error", t("عدد الأيدي المطلوبة بين ١ و٥٠٠.", "The number of hands needed must be between 1 and 500."));

  const { data, error } = await supabase
    .from("nafir_calls")
    .insert({
      organizer_id: user.id,
      display_name: str(fd, "display_name"),
      kind,
      title: str(fd, "title"),
      description: str(fd, "description"),
      state,
      locality: str(fd, "locality"),
      starts_on: str(fd, "starts_on"),
      needed,
      hosting: str(fd, "hosting") || null,
      bring_tools: str(fd, "bring_tools") || null,
      canal_id: str(fd, "canal_id") || null,
    })
    .select("id")
    .single();
  if (error || !data) done(back, "error", dbMessage(t, error?.message));
  done(`/nafir/${data.id}`, "ok", t("نُشرت الدعوة. شاركها على واتساب ليصل النداء.", "Your call is posted. Share it on WhatsApp so it reaches people."));
}

export async function joinCall(fd: FormData) {
  const id = str(fd, "call_id");
  const back = `/nafir/${id}`;
  const { supabase, user } = await session(back);
  const t = await tx();
  const { error } = await supabase.from("nafir_joins").insert({
    call_id: id,
    user_id: user.id,
    display_name: str(fd, "display_name"),
    brings: str(fd, "brings") || null,
  });
  if (error?.code === "23505") done(back, "error", t("لبّيتَ هذه الدعوة من قبل.", "You have already answered this call."));
  if (error) done(back, "error", dbMessage(t, error.message));
  done(back, "ok", t("لبّيتَ النداء. بلغ صاحبَ الدعوة اسمُك.", "You answered the call. The host has your name."));
}

export async function leaveCall(fd: FormData) {
  const id = str(fd, "call_id");
  const back = `/nafir/${id}`;
  const { supabase, user } = await session(back);
  const t = await tx();
  await supabase.from("nafir_joins").delete().eq("call_id", id).eq("user_id", user.id);
  done(back, "ok", t("سُحبت تلبيتك.", "Your answer is withdrawn."));
}

export async function closeCall(fd: FormData) {
  const id = str(fd, "call_id");
  const back = `/nafir/${id}`;
  const { supabase } = await session(back);
  const t = await tx();
  const status = str(fd, "status") === "cancelled" ? "cancelled" : "done";
  const patch =
    status === "done"
      ? { status, outcome: str(fd, "outcome"), attended: Number(str(fd, "attended")) }
      : { status };
  if (status === "done" && (!patch.outcome || !Number.isInteger(patch.attended)))
    done(back, "error", t("اكتب ما أُنجز وعدد من حضر.", "Write what was achieved and how many came."));
  const { data, error } = await supabase
    .from("nafir_calls")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) done(back, "error", dbMessage(t, error?.message));
  done(back, "ok", status === "done" ? t("أُغلق النفير بما أُنجز. بارك الله في الأيدي.", "The nafir is closed with what was achieved. God bless the hands that came.") : t("أُلغيت الدعوة.", "The call is cancelled."));
}

/* ───────────────────────── الفزعة ───────────────────────── */

export async function createFaza(fd: FormData) {
  const back = "/nafir/faza/new";
  const { supabase, user } = await session(back);
  const t = await tx();
  const cause = str(fd, "cause");
  const state = str(fd, "state");
  const needs = fd.getAll("needs").map(String).filter((n) => n in FAZA_NEEDS);
  if (!(cause in FAZA_CAUSES)) done(back, "error", t("اختر سبب الطلب.", "Choose the reason for the request."));
  if (!isState(state)) done(back, "error", t("اختر الولاية.", "Choose the state."));
  if (needs.length === 0) done(back, "error", t("اختر نوع العون الذي يفيدك.", "Choose the kind of help that would serve you."));

  const { data, error } = await supabase
    .from("faza_requests")
    .insert({
      requester_id: user.id,
      display_name: str(fd, "display_name"),
      cause,
      title: str(fd, "title"),
      description: str(fd, "description"),
      state,
      locality: str(fd, "locality"),
      needs,
    })
    .select("id")
    .single();
  if (error || !data) done(back, "error", dbMessage(t, error?.message));
  done(`/nafir/faza/${data.id}`, "ok", t("نُشر طلبك. الفزعة تبدأ بمن يرى.", "Your request is posted. Faza begins with whoever sees it."));
}

export async function pledgeFaza(fd: FormData) {
  const id = str(fd, "request_id");
  const back = `/nafir/faza/${id}`;
  const { supabase, user } = await session(back);
  const t = await tx();
  const kind = str(fd, "kind");
  if (!(kind in FAZA_NEEDS)) done(back, "error", t("اختر نوع ما تعاهد عليه.", "Choose the kind of help you are pledging."));
  const { error } = await supabase.from("faza_pledges").insert({
    request_id: id,
    pledger_id: user.id,
    display_name: str(fd, "display_name"),
    kind,
    detail: str(fd, "detail"),
  });
  if (error?.code === "23505") done(back, "error", t("عاهدتَ على هذا النوع من قبل.", "You have already pledged this kind of help."));
  if (error) done(back, "error", dbMessage(t, error.message));
  done(back, "ok", t("سُجّل عهدك، وبلغ صاحبَ الطلب. الوفاءُ يُثبته هو.", "Your pledge is recorded and the requester has been told. They are the one who confirms it was kept."));
}

export async function markKept(fd: FormData) {
  const id = str(fd, "request_id");
  const back = `/nafir/faza/${id}`;
  const { supabase } = await session(back);
  const t = await tx();
  const { data } = await supabase
    .from("faza_pledges")
    .update({ kept_at: new Date().toISOString() })
    .eq("id", str(fd, "pledge_id"))
    .select("kept_at");
  if (!data?.[0]?.kept_at) done(back, "error", t("الوفاءُ يشهد به صاحبُ الطلب وحده.", "Only the requester can confirm a pledge was kept."));
  done(back, "ok", t("شهدتَ بالوفاء. جزاه الله خيراً.", "You confirmed the pledge was kept. May God reward them."));
}

export async function closeFaza(fd: FormData) {
  const id = str(fd, "request_id");
  const back = `/nafir/faza/${id}`;
  const { supabase } = await session(back);
  const t = await tx();
  const status = str(fd, "status") === "met" ? "met" : "closed";
  const { data, error } = await supabase
    .from("faza_requests")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) done(back, "error", dbMessage(t, error?.message));
  done(back, "ok", status === "met" ? t("قُضيت الحاجة. الحمد لله.", "The need is met. Praise be to God.") : t("أُغلق الطلب.", "The request is closed."));
}

/* ───────────────────────── الشورى ───────────────────────── */

export async function askShura(fd: FormData) {
  const back = "/nafir/shura";
  const { supabase, user } = await session(back);
  const t = await tx();
  const { error } = await supabase.from("shura_items").insert({
    author_id: user.id,
    display_name: str(fd, "display_name"),
    kind: str(fd, "kind") === "proposal" ? "proposal" : "question",
    title: str(fd, "title"),
    body: str(fd, "body"),
  });
  if (error) done(back, "error", dbMessage(t, error.message));
  done(back, "ok", t("نُشر، وسيبقى ظاهراً بعمره حتى يُجاب.", "Posted. It will stay visible, with its age, until it is answered."));
}

export async function toggleSupport(fd: FormData) {
  const back = "/nafir/shura";
  const { supabase, user } = await session(back);
  const id = str(fd, "item_id");
  if (str(fd, "on") === "1") {
    await supabase.from("shura_supports").insert({ item_id: id, user_id: user.id });
  } else {
    await supabase.from("shura_supports").delete().eq("item_id", id).eq("user_id", user.id);
  }
  revalidatePath("/nafir/shura");
  redirect(`${back}#${id}`);
}

export async function answerShura(fd: FormData) {
  const id = str(fd, "item_id");
  const back = "/nafir/shura";
  const { supabase } = await session(back);
  const t = await tx();
  const { data } = await supabase
    .from("shura_items")
    .update({ answer: str(fd, "answer"), answer_name: str(fd, "answer_name") })
    .eq("id", id)
    .select("answer");
  if (!data?.[0]?.answer) done(back, "error", t("الإجابة للقادة المتحقَّق منهم وللإدارة.", "Only verified leaders and the administration can answer."));
  done(back, "ok", t("نُشرت الإجابة، وبلغت السائل.", "The answer is published, and the asker has been told."));
}

/* ───────────────────────── نبض الثقة ───────────────────────── */

export async function submitPulse(fd: FormData) {
  const back = "/nafir/pulse";
  const { supabase, user } = await session(back);
  const t = await tx();
  const row: Record<string, unknown> = { user_id: user.id, period: currentPeriod() };
  for (const q of PULSE_QUESTIONS) {
    const v = Number(str(fd, q.key));
    if (!Number.isInteger(v) || v < 1 || v > 5) done(back, "error", t("أجب عن الأسئلة الأربعة.", "Answer all four questions."));
    row[q.key] = v;
  }
  const { error } = await supabase.from("trust_pulse").insert(row);
  if (error?.code === "23505") done(back, "error", t("أجبتَ في هذا الربع. نلقاك في الربع القادم.", "You have already answered this quarter. See you next quarter."));
  if (error) done(back, "error", dbMessage(t, error.message));
  done(back, "ok", t("شكراً. إجابتك لا يقرؤها أحد، وتدخل في المتوسّط وحده.", "Thank you. No one reads your answer; it only goes into the average."));
}
