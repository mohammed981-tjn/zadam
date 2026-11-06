"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, numOrNull, signedIn, str, translator } from "@/lib/supplyActions";
import { signPartnershipAgreement, signedSentence } from "@/lib/contractSteps";
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

  if (model === "managed") {
    // The company is chosen from the verified list; the database checks it
    // again (verified, active, owned by neither party) before saving.
    const company = str(fd, "manager_company");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(company)) {
      back(id, "error", t("اختر الشركة الشريكة التي تدير الزراعة.", "Choose the partner company that will manage the farming."));
    }
    const managerShare = numOrNull(fd, "manager_share");
    if (managerShare === null || managerShare < 1 || managerShare > 50) {
      back(id, "error", t("حصّة الشركة المديرة نسبةٌ من صافي الربح بين ١ و٥٠.", "The managing company's share is a percentage of net profit between 1 and 50."));
    }
    terms.manager_company = company;
    terms.manager_share = managerShare;
  }
  if (model === "sharecrop" || model === "finance" || model === "musaqah" || model === "managed") {
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
  const ua = (await headers()).get("user-agent") ?? null;
  // The checks and the database function are shared with the phone app's route (src/lib/contractSteps.ts): the
  // same confirmation, signature and name, and the same partnership_agreement_sign.
  const result = await signPartnershipAgreement(
    supabase,
    {
      agreementId: id,
      version: Number(str(fd, "version")),
      hash: str(fd, "hash"),
      fullName: str(fd, "full_name"),
      signature: str(fd, "signature"),
      agree: str(fd, "agree"),
      userAgent: ua,
    },
    { locale, t },
  );
  if (!result.ok) back(id, "error", result.message);
  back(id, "ok", signedSentence(result.data, t));
}
