"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

const isState = (s: string) => (SUDAN_STATES as readonly string[]).includes(s);
const dbMessage = (m?: string) =>
  m && /[؀-ۿ]/.test(m) ? m : "تعذّر الحفظ. راجع الحقول وأعد المحاولة.";

/* ───────────────────────── الميثاق ───────────────────────── */

export async function signCharter(fd: FormData) {
  const back = "/nafir/charter";
  const { supabase, user } = await session(back);
  const role = str(fd, "role") === "leader" ? "leader" : "member";
  const display_name = str(fd, "display_name");
  const pledge = str(fd, "pledge") || null;
  const state = str(fd, "state") || null;
  if (display_name.length < 2) done(back, "error", "اكتب الاسم الذي يظهر تحت توقيعك.");
  if (state && !isState(state)) done(back, "error", "اختر ولايةً من القائمة.");
  if (!fd.get("agree")) done(back, "error", "التوقيع يحتاج أن تؤكّد أنك قرأت الميثاق.");

  const { error } = await supabase.from("charter_signatures").insert({
    user_id: user.id,
    charter_version: CHARTER_VERSION,
    role,
    display_name,
    pledge,
    state,
  });
  if (error?.code === "23505") done(back, "error", "وقّعتَ هذا الميثاق من قبل.");
  if (error) done(back, "error", dbMessage(error.message));
  done(
    back,
    "ok",
    role === "leader"
      ? "وُقِّع الميثاق. سيظهر اسمك بين القادة، ويُتحقَّق منه قبل أن تُجيب في الشورى."
      : "وُقِّع الميثاق. مرحباً بك في النفير.",
  );
}

export async function withdrawSignature() {
  const back = "/nafir/charter";
  const { supabase, user } = await session(back);
  await supabase
    .from("charter_signatures")
    .delete()
    .eq("user_id", user.id)
    .eq("charter_version", CHARTER_VERSION);
  done(back, "ok", "سُحب توقيعك. الميثاق لا يُلزم مَن لم يختره.");
}

export async function verifyLeader(fd: FormData) {
  const back = "/nafir/charter";
  const { supabase } = await session(back);
  const userId = str(fd, "user_id");
  const { data, error } = await supabase
    .from("charter_signatures")
    .update({ verified_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("charter_version", CHARTER_VERSION)
    .select("user_id");
  if (error || !data?.length) done(back, "error", "لم يُتحقَّق — التحقّق للإدارة وحدها.");
  done(back, "ok", "تُحقِّق من القائد، وصار يستطيع الإجابة في الشورى.");
}

/* ───────────────────────── النفير ───────────────────────── */

export async function createCall(fd: FormData) {
  const back = "/nafir/new";
  const { supabase, user } = await session(back);
  const kind = str(fd, "kind");
  const state = str(fd, "state");
  const needed = Number(str(fd, "needed"));
  if (!(kind in NAFIR_KINDS)) done(back, "error", "اختر نوع العمل.");
  if (!isState(state)) done(back, "error", "اختر الولاية.");
  if (!Number.isInteger(needed) || needed < 1 || needed > 500)
    done(back, "error", "عدد الأيدي المطلوبة بين ١ و٥٠٠.");

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
    })
    .select("id")
    .single();
  if (error || !data) done(back, "error", dbMessage(error?.message));
  done(`/nafir/${data.id}`, "ok", "نُشرت الدعوة. شاركها على واتساب ليصل النداء.");
}

export async function joinCall(fd: FormData) {
  const id = str(fd, "call_id");
  const back = `/nafir/${id}`;
  const { supabase, user } = await session(back);
  const { error } = await supabase.from("nafir_joins").insert({
    call_id: id,
    user_id: user.id,
    display_name: str(fd, "display_name"),
    brings: str(fd, "brings") || null,
  });
  if (error?.code === "23505") done(back, "error", "لبّيتَ هذه الدعوة من قبل.");
  if (error) done(back, "error", dbMessage(error.message));
  done(back, "ok", "لبّيتَ النداء. بلغ صاحبَ الدعوة اسمُك.");
}

export async function leaveCall(fd: FormData) {
  const id = str(fd, "call_id");
  const back = `/nafir/${id}`;
  const { supabase, user } = await session(back);
  await supabase.from("nafir_joins").delete().eq("call_id", id).eq("user_id", user.id);
  done(back, "ok", "سُحبت تلبيتك.");
}

export async function closeCall(fd: FormData) {
  const id = str(fd, "call_id");
  const back = `/nafir/${id}`;
  const { supabase } = await session(back);
  const status = str(fd, "status") === "cancelled" ? "cancelled" : "done";
  const patch =
    status === "done"
      ? { status, outcome: str(fd, "outcome"), attended: Number(str(fd, "attended")) }
      : { status };
  if (status === "done" && (!patch.outcome || !Number.isInteger(patch.attended)))
    done(back, "error", "اكتب ما أُنجز وعدد من حضر.");
  const { data, error } = await supabase
    .from("nafir_calls")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) done(back, "error", dbMessage(error?.message));
  done(back, "ok", status === "done" ? "أُغلق النفير بما أُنجز. بارك الله في الأيدي." : "أُلغيت الدعوة.");
}

/* ───────────────────────── الفزعة ───────────────────────── */

export async function createFaza(fd: FormData) {
  const back = "/nafir/faza/new";
  const { supabase, user } = await session(back);
  const cause = str(fd, "cause");
  const state = str(fd, "state");
  const needs = fd.getAll("needs").map(String).filter((n) => n in FAZA_NEEDS);
  if (!(cause in FAZA_CAUSES)) done(back, "error", "اختر سبب الطلب.");
  if (!isState(state)) done(back, "error", "اختر الولاية.");
  if (needs.length === 0) done(back, "error", "اختر نوع العون الذي يفيدك.");

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
  if (error || !data) done(back, "error", dbMessage(error?.message));
  done(`/nafir/faza/${data.id}`, "ok", "نُشر طلبك. الفزعة تبدأ بمن يرى.");
}

export async function pledgeFaza(fd: FormData) {
  const id = str(fd, "request_id");
  const back = `/nafir/faza/${id}`;
  const { supabase, user } = await session(back);
  const kind = str(fd, "kind");
  if (!(kind in FAZA_NEEDS)) done(back, "error", "اختر نوع ما تعاهد عليه.");
  const { error } = await supabase.from("faza_pledges").insert({
    request_id: id,
    pledger_id: user.id,
    display_name: str(fd, "display_name"),
    kind,
    detail: str(fd, "detail"),
  });
  if (error?.code === "23505") done(back, "error", "عاهدتَ على هذا النوع من قبل.");
  if (error) done(back, "error", dbMessage(error.message));
  done(back, "ok", "سُجّل عهدك، وبلغ صاحبَ الطلب. الوفاءُ يُثبته هو.");
}

export async function markKept(fd: FormData) {
  const id = str(fd, "request_id");
  const back = `/nafir/faza/${id}`;
  const { supabase } = await session(back);
  const { data } = await supabase
    .from("faza_pledges")
    .update({ kept_at: new Date().toISOString() })
    .eq("id", str(fd, "pledge_id"))
    .select("kept_at");
  if (!data?.[0]?.kept_at) done(back, "error", "الوفاءُ يشهد به صاحبُ الطلب وحده.");
  done(back, "ok", "شهدتَ بالوفاء. جزاه الله خيراً.");
}

export async function closeFaza(fd: FormData) {
  const id = str(fd, "request_id");
  const back = `/nafir/faza/${id}`;
  const { supabase } = await session(back);
  const status = str(fd, "status") === "met" ? "met" : "closed";
  const { data, error } = await supabase
    .from("faza_requests")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) done(back, "error", dbMessage(error?.message));
  done(back, "ok", status === "met" ? "قُضيت الحاجة. الحمد لله." : "أُغلق الطلب.");
}

/* ───────────────────────── الشورى ───────────────────────── */

export async function askShura(fd: FormData) {
  const back = "/nafir/shura";
  const { supabase, user } = await session(back);
  const { error } = await supabase.from("shura_items").insert({
    author_id: user.id,
    display_name: str(fd, "display_name"),
    kind: str(fd, "kind") === "proposal" ? "proposal" : "question",
    title: str(fd, "title"),
    body: str(fd, "body"),
  });
  if (error) done(back, "error", dbMessage(error.message));
  done(back, "ok", "نُشر، وسيبقى ظاهراً بعمره حتى يُجاب.");
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
  const { data } = await supabase
    .from("shura_items")
    .update({ answer: str(fd, "answer"), answer_name: str(fd, "answer_name") })
    .eq("id", id)
    .select("answer");
  if (!data?.[0]?.answer) done(back, "error", "الإجابة للقادة المتحقَّق منهم وللإدارة.");
  done(back, "ok", "نُشرت الإجابة، وبلغت السائل.");
}

/* ───────────────────────── نبض الثقة ───────────────────────── */

export async function submitPulse(fd: FormData) {
  const back = "/nafir/pulse";
  const { supabase, user } = await session(back);
  const row: Record<string, unknown> = { user_id: user.id, period: currentPeriod() };
  for (const q of PULSE_QUESTIONS) {
    const v = Number(str(fd, q.key));
    if (!Number.isInteger(v) || v < 1 || v > 5) done(back, "error", "أجب عن الأسئلة الأربعة.");
    row[q.key] = v;
  }
  const { error } = await supabase.from("trust_pulse").insert(row);
  if (error?.code === "23505") done(back, "error", "أجبتَ في هذا الربع. نلقاك في الربع القادم.");
  if (error) done(back, "error", dbMessage(error.message));
  done(back, "ok", "شكراً. إجابتك لا يقرؤها أحد، وتدخل في المتوسّط وحده.");
}
