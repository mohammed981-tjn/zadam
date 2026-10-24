"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { soilAt } from "@/lib/rainMap";
import { INVESTOR_MODELS } from "@/lib/investors";

/**
 * Every step between an investor and a landowner is a database function
 * (supabase/migrations/20261021210000_investor_partnerships.sql) that checks
 * who is taking it. These actions carry the form there; the checks here only
 * turn an obviously incomplete form into a sentence before the round trip.
 */

function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/invest", "layout");
  revalidatePath("/lands");
  revalidatePath("/admin/inbox");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

const models = (fd: FormData) =>
  [...new Set(fd.getAll("models").map(String).filter((m) => (INVESTOR_MODELS as readonly string[]).includes(m)))];

// ── المستثمر ─────────────────────────────────────────────────────────────────

export async function expressInvestorInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  // Asked from a project page (backlog 135): a refusal goes back there. Nowhere else.
  const from = str(fd, "return_to");
  const origin = /^\/projects\/[A-Za-z0-9_-]{1,80}$/.test(from) ? from : "/invest";
  const model = str(fd, "model");
  const message = str(fd, "message");
  if (!(INVESTOR_MODELS as readonly string[]).includes(model)) {
    back(origin, "error", t("اختر نموذج الشراكة.", "Choose a partnership model."));
  }
  if (message.length < 10) {
    back(
      origin,
      "error",
      t(
        "اكتب لصاحب الأرض سطرين على الأقلّ: من أنت، وماذا تقترح.",
        "Write the owner at least a couple of lines: who you are and what you propose.",
      ),
    );
  }
  // البند ١٣٦: الإقرار بالمخاطرة شرطٌ، والقاعدة تتحقّق منه وتحفظ وقته.
  if (str(fd, "risk_ack") !== "yes") {
    back(
      origin,
      "error",
      t(
        "اقرأ تنبيه المخاطرة وأقرّ به قبل أن ترسل الطلب.",
        "Read the risk notice and confirm it before sending the request.",
      ),
    );
  }
  const { error } = await supabase.rpc("investor_express_interest", {
    p_land: str(fd, "land_id"),
    p_model: model,
    p_message: message.slice(0, 1000),
    p_risk_ack: true,
  });
  if (error) back(origin, "error", explain(locale, error));
  back(
    "/invest/mine",
    "ok",
    t(
      "أُرسل طلبك. وصل صاحبَ الأرض إشعار، وحين يقبل ترى اسمه وهاتفه وموقع الأرض هنا.",
      "Your request was sent. The owner has been notified; once they accept you will see their name, phone and the land's location here.",
    ),
  );
}

export async function withdrawInvestorInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("investor_interest_withdraw", { p_interest: str(fd, "interest_id") });
  if (error) back("/invest/mine", "error", explain(locale, error));
  back("/invest/mine", "ok", t("سُحب الطلب.", "Request withdrawn."));
}

// ── صاحب الأرض ───────────────────────────────────────────────────────────────

/**
 * Opens or closes a verified land to investors. The soil class is read here
 * from the national soil map at the land's own coordinates, as for partner
 * companies — the owner does not type it.
 */
export async function setInvestorConsent(fd: FormData) {
  const { supabase, user } = await signedIn();
  const { locale, t } = await translator();
  // Sent from the project page built on this land: back there. Nowhere else.
  const from = str(fd, "return_to");
  const origin = /^\/projects\/[A-Za-z0-9_-]{1,80}$/.test(from) ? from : "/lands";
  const landId = str(fd, "land_id");
  const open = str(fd, "open") === "true";
  const chosen = models(fd);
  if (open && chosen.length === 0) {
    back(origin, "error", t("اختر نموذجاً واحداً على الأقلّ من نماذج الشراكة.", "Choose at least one partnership model."));
  }
  const { data: land } = await supabase
    .from("lands")
    .select("latitude, longitude")
    .eq("id", landId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!land) back(origin, "error", t("ليست لك هذه الأرض.", "This land is not yours."));
  const note = str(fd, "note").slice(0, 500);
  const { error } = await supabase.rpc("land_set_investor_consent", {
    p_land: landId,
    p_open: open,
    p_models: chosen,
    p_note: note.length >= 10 ? note : null,
    p_soil_class: soilAt(land.longitude, land.latitude),
  });
  if (error) back(origin, "error", explain(locale, error));
  if (origin !== "/lands") revalidatePath(origin);
  back(
    origin,
    "ok",
    open
      ? t(
          "عُرضت أرضك في صفحة فرص الاستثمار. يرى المستثمر الولاية والمحليّة والمساحة والتربة والماء فقط، ولا يرى اسمك ولا موقعها حتى تقبل طلبه.",
          "Your land is now on the investment opportunities page. Investors see only its state, locality, area, soil and water — not your name or its location until you accept a request.",
        )
      : t("أُغلقت الأرض أمام المستثمرين.", "Your land is closed to investors."),
  );
}

export async function decideInvestorInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const accept = str(fd, "accept") === "true";
  const { error } = await supabase.rpc("land_investor_decide", {
    p_interest: str(fd, "interest_id"),
    p_accept: accept,
  });
  if (error) back("/lands", "error", explain(locale, error));
  back(
    "/lands",
    "ok",
    accept
      ? t(
          "قبلتَ الطلب. يرى المستثمر الآن اسمك وهاتفك وموقع الأرض، وترى هاتفه هنا. اتّفقا كتابةً قبل أيّ دفع.",
          "You accepted. The investor now sees your name, phone and the land's location, and you see their phone here. Agree in writing before any payment.",
        )
      : t("اعتذرتَ عن الطلب، ووصل المستثمرَ الجواب.", "You declined, and the investor has been told."),
  );
}
