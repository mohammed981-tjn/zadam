"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, numOrNull, signedIn, str, translator } from "@/lib/supplyActions";
import { AGREEMENT_ITEMS, LOSS_RULES, RENT_SCHEDULES, type AgreementTerms } from "@/lib/agreements";

/**
 * The partnership agreement's three steps (backlog 127). Each is a database
 * function that checks the caller is a party (supabase/migrations/
 * 20261021230000_partnership_agreements.sql); these only carry the form there.
 */

function back(id: string, key: "ok" | "error", message: string): never {
  revalidatePath(`/invest/agreements/${id}`);
  redirect(`/invest/agreements/${id}?${key}=${encodeURIComponent(message)}`);
}

/** From an accepted request on the land card or «طلباتي»: open (or reopen) its agreement. */
export async function openAgreement(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const { data, error } = await supabase.rpc("partnership_agreement_open", { p_interest: str(fd, "interest_id") });
  if (error || !data) {
    const from = str(fd, "from") === "owner" ? "/lands" : "/invest/mine";
    redirect(`${from}?error=${encodeURIComponent(explain(locale, error))}`);
  }
  redirect(`/invest/agreements/${data}`);
}

export async function saveAgreement(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "agreement_id");
  const model = str(fd, "model");

  const owner_provides: string[] = [];
  const investor_provides: string[] = [];
  for (const item of AGREEMENT_ITEMS) {
    const who = str(fd, `item_${item}`);
    if (who === "owner") owner_provides.push(item);
    if (who === "investor") investor_provides.push(item);
  }

  const terms: AgreementTerms = {
    crop: str(fd, "crop").slice(0, 80),
    season: str(fd, "season").slice(0, 80),
    start_date: str(fd, "start_date"),
    end_date: str(fd, "end_date"),
    feddans: numOrNull(fd, "feddans") ?? undefined,
    owner_provides: owner_provides as AgreementTerms["owner_provides"],
    investor_provides: investor_provides as AgreementTerms["investor_provides"],
    loss_rule: (LOSS_RULES as readonly string[]).includes(str(fd, "loss_rule"))
      ? (str(fd, "loss_rule") as AgreementTerms["loss_rule"])
      : undefined,
  };
  const lossText = str(fd, "loss_text").slice(0, 1000);
  if (terms.loss_rule === "custom" && lossText) terms.loss_text = lossText;
  const extra = str(fd, "extra").slice(0, 2000);
  if (extra) terms.extra = extra;

  if (model === "sharecrop" || model === "finance" || model === "musaqah") {
    const ownerShare = numOrNull(fd, "owner_share");
    if (ownerShare === null || ownerShare < 1 || ownerShare > 99) {
      back(id, "error", t("اكتب حصّة صاحب الأرض نسبةً بين ١ و٩٩.", "Enter the landowner's share as a percentage between 1 and 99."));
    }
    terms.owner_share = ownerShare;
    terms.investor_share = 100 - ownerShare;
  }
  if (model === "lease") {
    terms.rent_amount = numOrNull(fd, "rent_amount") ?? undefined;
    const schedule = str(fd, "rent_schedule");
    if ((RENT_SCHEDULES as readonly string[]).includes(schedule)) terms.rent_schedule = schedule as AgreementTerms["rent_schedule"];
  }
  if (model === "finance") terms.finance_amount = numOrNull(fd, "finance_amount") ?? undefined;
  if (model === "lease" || model === "finance") {
    const c = str(fd, "currency");
    if (c === "SDG" || c === "USD") terms.currency = c;
  }

  const { error } = await supabase.rpc("partnership_agreement_save", { p_agreement: id, p_terms: terms });
  if (error) back(id, "error", explain(locale, error));
  back(
    id,
    "ok",
    t(
      "حُفظت البنود نسخةً جديدة، ووصل الطرفَ الآخر إشعار. اقرأ العقد أدناه ثمّ وقّع.",
      "The terms were saved as a new version and the other party was notified. Read the agreement below, then sign.",
    ),
  );
}

export async function signAgreement(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const id = str(fd, "agreement_id");
  if (str(fd, "agree") !== "yes") {
    back(id, "error", t("أكّد أنّك قرأت العقد ووافقت على بنوده.", "Confirm that you have read the agreement and accept its terms."));
  }
  const signature = str(fd, "signature");
  if (!/^[ML0-9 .-]{20,30000}$/.test(signature)) {
    back(id, "error", t("ارسم توقيعك بإصبعك في المربّع.", "Draw your signature with your finger in the box."));
  }
  const fullName = str(fd, "full_name");
  if (fullName.length < 5) {
    back(id, "error", t("اكتب اسمك الكامل كما في إثبات هويّتك.", "Write your full name as on your ID."));
  }
  const ua = (await headers()).get("user-agent") ?? null;
  const { data, error } = await supabase.rpc("partnership_agreement_sign", {
    p_agreement: id,
    p_version: Number(str(fd, "version")),
    p_hash: str(fd, "hash"),
    p_full_name: fullName.slice(0, 120),
    p_signature: signature,
    p_user_agent: ua ? ua.slice(0, 400) : null,
  });
  if (error) back(id, "error", explain(locale, error));
  back(
    id,
    "ok",
    data
      ? t(
          `وقّع الطرفان. أُقفل العقد وشهدت عليه سوداقري برقم ${data}.`,
          `Both parties have signed. The agreement is sealed and witnessed by Sudagri under reference ${data}.`,
        )
      : t(
          "وُقِّع توقيعك. وصل الطرفَ الآخر إشعار، ويُقفل العقد حين يوقّع.",
          "Your signature is recorded. The other party was notified; the agreement is sealed when they sign.",
        ),
  );
}
