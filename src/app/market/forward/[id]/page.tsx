import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { button, card, field, ghost, label } from "@/lib/ui";
import { OFFER_UNIT_NAME } from "@/lib/marketOffers";
import {
  FORWARD_EVENT_LABEL,
  FORWARD_STATUS_LABEL,
  type ForwardContract,
  type ForwardEvent,
} from "@/lib/forwardContracts";
import { forwardStep } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "عقدٌ آجل | سوداقري", "Forward contract | Sudagri") };
}

/**
 * العقد الآجل نفسه (البند ١٧٠): نصّه من شروطه، وطرفاه، وحاله، وما جرى عليه، والخطوة التي تنتظر من يقرؤه. لا يراه غير
 * طرفيه والإدارة؛ والقاعدة هي التي تقرّر من يخطو أيّ خطوة، فالصفحة تعرض ما يليق بالقارئ فقط.
 */
export default async function ForwardContractPage({ params, searchParams }: PageProps<"/market/forward/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/market/forward/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";

  const [{ data: row }, { data: partyRows }, { data: eventRows }, { data: profile }] = await Promise.all([
    supabase.from("forward_contracts").select("*").eq("id", id).maybeSingle(),
    supabase.rpc("forward_contract_parties", { p_id: id }),
    supabase.from("forward_contract_events").select("id, actor_id, event, note, at").eq("contract_id", id).order("id"),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const c = row as ForwardContract | null;
  if (!c) notFound();
  const parties = ((partyRows ?? []) as { buyer_name: string | null; buyer_phone: string | null; farmer_name: string | null; farmer_phone: string | null }[])[0];
  const events = (eventRows ?? []) as ForwardEvent[];
  const isAdmin = (profile as { role: string } | null)?.role === "admin";
  const isBuyer = c.buyer_id === user.id;
  const isFarmer = c.farmer_id === user.id;
  const unit = en ? OFFER_UNIT_NAME[c.unit].en : OFFER_UNIT_NAME[c.unit].ar;
  const money = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const date = (d: string) => new Date(d).toLocaleDateString(en ? "en-GB" : "ar-EG", { dateStyle: "long" });
  const who = (name: string | null | undefined, tail: boolean) =>
    name ?? (tail ? t(`صاحب الرقم …${c.phone_tail}`, `the holder of …${c.phone_tail}`) : t("—", "—"));
  // The proposer typed the other side's number; until they sign, the other side is named by its last digits.
  const buyerTail = c.proposed_by !== c.buyer_id;
  const farmerTail = c.proposed_by !== c.farmer_id;
  const actor = (a: string | null) =>
    a === c.buyer_id ? t("المشتري", "the buyer") : a === c.farmer_id ? t("المزارع", "the farmer") : t("الإدارة", "the administration");

  const step = (name: string, text: string, style = button) => (
    <button name="step" value={name} className={style}>
      {text}
    </button>
  );
  const reasonBox = (placeholder: string, required = true) => (
    <textarea name="reason" required={required} minLength={required ? 5 : undefined} maxLength={1000} rows={2} placeholder={placeholder} className={field} />
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/market/forward" className="text-sm text-primary underline">
        {t("→ العقود الآجلة", "← Forward contracts")}
      </Link>
      <p className="mt-4 text-xs text-muted">
        {c.ref} · {tr(locale, ...FORWARD_STATUS_LABEL[c.status])}
      </p>
      <h1 className="mt-1 font-black" style={{ fontSize: "var(--text-title)" }}>
        {t("عقد بيعٍ آجل", "Forward sale contract")}: {c.crop}
      </h1>
      {typeof sp.ok === "string" && <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm">{sp.ok}</p>}
      {typeof sp.error === "string" && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{sp.error}</p>}

      <section className={`${card} mt-6 leading-8`}>
        <p>
          {t("اتّفق ", "")}
          <b>{who(parties?.farmer_name, farmerTail)}</b>
          {parties?.farmer_phone && (
            <span dir="ltr" className="text-sm text-muted">
              {" "}
              ({parties.farmer_phone})
            </span>
          )}
          {t(" (المزارع، البائع) و", " (the farmer, seller) and ")}
          <b>{who(parties?.buyer_name, buyerTail)}</b>
          {parties?.buyer_phone && (
            <span dir="ltr" className="text-sm text-muted">
              {" "}
              ({parties.buyer_phone})
            </span>
          )}
          {t(" (المشتري) على ما يلي:", " (the buyer) agree as follows:")}
        </p>
        <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm">
          <li>
            {t("يبيع المزارع ويشتري المشتري ", "The farmer sells and the buyer buys ")}
            <b dir="ltr">{money(c.quantity)}</b> {unit} {t("من ", "of ")}
            <b>{c.crop}</b>
            {t(`، بزيادةٍ أو نقصٍ حتى ${c.tolerance_percent}٪ لا يُعدّ إخلالاً.`, `, with up to ${c.tolerance_percent}% more or less not counted as a breach.`)}
          </li>
          <li>
            {t("بالدرجة: ", "At the grade: ")}
            {c.grade}
          </li>
          <li>
            {t("بسعر ", "At a price of ")}
            <b dir="ltr">
              {money(c.price)} {c.currency}
            </b>{" "}
            {t(`لل${unit}`, `per ${unit}`)}
            {t("، فقيمة العقد ", ", so the contract is worth ")}
            <b dir="ltr">
              {money(c.price * c.quantity)} {c.currency}
            </b>
            .
          </li>
          <li>
            {t("يُسلَّم بين ", "Delivered between ")}
            <b>{date(c.delivery_from)}</b> {t("و", "and ")}
            <b>{date(c.delivery_to)}</b> {t("في ", "at ")}
            {c.delivery_place}.
          </li>
          <li>
            {t("الدفع: ", "Payment: ")}
            {c.payment_terms}
            {c.advance_percent != null && c.advance_percent > 0 && t(`، ومقدَّمٌ ${c.advance_percent}٪ عند التوقيع.`, `, with a ${c.advance_percent}% advance on signing.`)}
          </li>
          {c.consignee_name && (
            <li>
              {t("يستلم عن المشتري: ", "Received for the buyer by: ")}
              <b>{c.consignee_name}</b>{" "}
              <span dir="ltr" className="text-muted">
                ({c.consignee_phone})
              </span>
              {t("، ويسجّل المشتري الاستلام حين يخبره.", "; the buyer records the delivery when told.")}
            </li>
          )}
          <li>
            {t("الشرط الجزائيّ: ", "Penalty clause: ")}
            {t(
              `على من يتأخّر في التسليم ${c.late_penalty_pct_week}٪ من قيمة العقد عن كلّ أسبوعٍ بعد آخر موعد، حتى ${c.late_penalty_cap_pct}٪؛ وعلى من يمتنع عن التسليم أو الاستلام ${c.breach_penalty_pct}٪ من قيمة العقد للطرف الآخر.`,
              `whoever delivers late owes ${c.late_penalty_pct_week}% of the contract's value for each week past the last delivery date, up to ${c.late_penalty_cap_pct}%; whoever refuses to deliver or take delivery owes the other side ${c.breach_penalty_pct}% of its value.`,
            )}
            {c.force_majeure &&
              t(" وتُعفى القوّة القاهرة: حربٌ، أو سيلٌ، أو جراد، أو إغلاقُ طريق.", " Force majeure is exempt: war, flood, locusts, or a closed road.")}
          </li>
          {c.notes && <li>{c.notes}</li>}
          <li>
            {t(
              "يدفع المشتري للمزارع مباشرةً؛ سوداقري لا تحمل المال ولا تضمن التسليم ولا السداد. لا تتغيّر هذه الشروط بعد التوقيع، ولا يُلغى العقد إلا باتّفاق الطرفين أو بفصل الإدارة في نزاع.",
              "The buyer pays the farmer directly; Sudagri holds no money and guarantees neither delivery nor payment. These terms do not change after signing, and the contract is cancelled only by agreement of both sides or by the administration's decision in a dispute.",
            )}
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          {t("اقتُرح ووقّعه مقترحه في ", "Proposed and signed by its proposer on ")}
          {date(c.proposed_at)}
          {c.signed_at && (
            <>
              {t("، ووقّعه الطرف الآخر في ", "; signed by the other side on ")}
              {date(c.signed_at)}
            </>
          )}
          .
        </p>
      </section>

      {c.penalty_awarded != null && (
        <p className="mt-4 rounded-xl bg-accent/10 p-3 text-sm">
          {t("حكمت الإدارة بغرامة ", "The administration awarded a penalty of ")}
          <b dir="ltr">
            {money(c.penalty_awarded)} {c.currency}
          </b>{" "}
          {c.penalty_payer === "farmer" ? t("يدفعها المزارع للمشتري مباشرةً.", "paid by the farmer to the buyer directly.") : t("يدفعها المشتري للمزارع مباشرةً.", "paid by the buyer to the farmer directly.")}
        </p>
      )}
      {c.delivered_on && (
        <section className={`${card} mt-4 text-sm`}>
          <p className="font-bold">{t("التسليم كما سجّله المشتري", "The delivery as the buyer recorded it")}</p>
          <p className="mt-1">
            <span dir="ltr">{money(c.delivered_quantity ?? 0)}</span> {unit} · {date(c.delivered_on)} ·{" "}
            {c.grade_met ? t("مطابقٌ للدرجة", "matching the grade") : t("خالف الدرجة", "not matching the grade")}
          </p>
          {c.delivery_note && <p className="mt-1 text-muted">{c.delivery_note}</p>}
        </section>
      )}

      {/* ما ينتظر قارئ الصفحة */}
      <section className="mt-6 grid gap-4">
        {c.status === "proposed" && (isBuyer || isFarmer) && c.proposed_by !== user.id && (
          <form action={forwardStep} className={`${card} ring-2 ring-accent/40`}>
            <input type="hidden" name="id" value={c.id} />
            <p className="text-sm leading-7">
              {t(
                "بتوقيعك يصير العقد ملزماً لكما بشروطه أعلاه. وقّع إن كنت تعرف الطرف الآخر واتّفقتما على هذا.",
                "Signing makes the contract bind you both by the terms above. Sign if you know the other side and agreed this.",
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {step("sign", t("أوقّع العقد", "I sign the contract"))}
              {step("decline", t("أعتذر", "Decline"), ghost)}
            </div>
          </form>
        )}
        {c.status === "proposed" && c.proposed_by === user.id && (
          <form action={forwardStep} className={card}>
            <input type="hidden" name="id" value={c.id} />
            <p className="text-sm text-muted">{t("ينتظر توقيع الطرف الآخر.", "Awaiting the other side's signature.")}</p>
            <div className="mt-3">{step("withdraw", t("اسحب الاقتراح", "Withdraw the proposal"), ghost)}</div>
          </form>
        )}
        {c.status === "signed" && isBuyer && (
          <form action={forwardStep} className={card}>
            <input type="hidden" name="id" value={c.id} />
            <p className="font-bold">{t("سجّل ما استلمت", "Record what you received")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className={label}>
                {t(`الكميّة (${unit})`, `Quantity (${unit})`)}
                <input name="delivered_quantity" required inputMode="decimal" className={field} />
              </label>
              <label className={label}>
                {t("تاريخ الاستلام", "Date received")}
                <input name="delivered_on" type="date" required className={field} />
              </label>
              <label className={label}>
                {t("هل طابقت الدرجة؟", "Did it match the grade?")}
                <select name="grade_met" required defaultValue="" className={field}>
                  <option value="" disabled>
                    {t("اختر", "Choose")}
                  </option>
                  <option value="yes">{t("نعم", "Yes")}</option>
                  <option value="no">{t("لا", "No")}</option>
                </select>
              </label>
            </div>
            <div className="mt-3">{reasonBox(t("ملاحظة (تلزم إن خالفت الدرجة)", "A note (required if the grade did not match)"), false)}</div>
            <div className="mt-3">{step("deliver", t("سجّل التسليم", "Record the delivery"))}</div>
          </form>
        )}
        {c.status === "delivered" && isFarmer && (
          <form action={forwardStep} className={`${card} ring-2 ring-accent/40`}>
            <input type="hidden" name="id" value={c.id} />
            <p className="text-sm">{t("إن كان ما سجّله المشتري صحيحاً فأكّده، فيُقفل العقد.", "If what the buyer recorded is right, confirm it and the contract closes.")}</p>
            <div className="mt-3">{step("confirm", t("أؤكّد التسليم", "I confirm the delivery"))}</div>
          </form>
        )}
        {c.status === "cancel_requested" && (isBuyer || isFarmer) && c.cancel_requested_by !== user.id && (
          <form action={forwardStep} className={`${card} ring-2 ring-accent/40`}>
            <input type="hidden" name="id" value={c.id} />
            <p className="text-sm">{t("يطلب الطرف الآخر إلغاء العقد. لا يُلغى إلا إن قبلت.", "The other side asks to cancel the contract. It is cancelled only if you accept.")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {step("cancel_yes", t("أقبل الإلغاء", "Accept cancellation"))}
              {step("cancel_no", t("أرفض، والعقد قائم", "Refuse: the contract stands"), ghost)}
            </div>
          </form>
        )}
        {(c.status === "signed" || c.status === "delivered") && (isBuyer || isFarmer) && (
          <form action={forwardStep} className={card}>
            <input type="hidden" name="id" value={c.id} />
            <p className="font-bold">{t("اطلب الإلغاء", "Ask to cancel")}</p>
            <div className="mt-2">{reasonBox(t("السبب: يقرؤه الطرف الآخر", "The reason: the other side reads it"))}</div>
            <div className="mt-3">{step("cancel", t("أرسل طلب الإلغاء", "Send the request"), ghost)}</div>
          </form>
        )}
        {(c.status === "signed" || c.status === "delivered" || c.status === "cancel_requested") && (isBuyer || isFarmer) && (
          <form action={forwardStep} className={card}>
            <input type="hidden" name="id" value={c.id} />
            <p className="font-bold">{t("ارفع نزاعاً إلى الإدارة", "Raise a dispute with the administration")}</p>
            <p className="mt-1 text-xs text-muted">{t("حين لا تتّفقان: تسمع الإدارة الطرفين وتكتب ما فصلت به.", "When you cannot agree: the administration hears both sides and writes down its decision.")}</p>
            <div className="mt-2">{reasonBox(t("ما الخلاف؟", "What is the disagreement?"))}</div>
            <div className="mt-3">{step("dispute", t("ارفع النزاع", "Raise the dispute"), ghost)}</div>
          </form>
        )}
        {c.status === "disputed" && isAdmin && (
          <form action={forwardStep} className={`${card} ring-2 ring-accent/40`}>
            <input type="hidden" name="id" value={c.id} />
            <p className="font-bold">{t("الفصل في النزاع", "Decide the dispute")}</p>
            <div className="mt-2">{reasonBox(t("ما فصلت به وسببه: يقرؤه الطرفان", "Your decision and why: both sides read it"))}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={label}>
                {t(
                  `غرامة بحسب الشرط الجزائيّ (اختياريّ، حتى ${money((c.price * c.quantity * Math.max(c.late_penalty_cap_pct, c.breach_penalty_pct)) / 100)} ${c.currency})`,
                  `Penalty under the clause (optional, up to ${money((c.price * c.quantity * Math.max(c.late_penalty_cap_pct, c.breach_penalty_pct)) / 100)} ${c.currency})`,
                )}
                <input name="penalty" inputMode="decimal" className={field} />
              </label>
              <label className={label}>
                {t("يدفعها", "Paid by")}
                <select name="penalty_payer" defaultValue="" className={field}>
                  <option value="">—</option>
                  <option value="farmer">{t("المزارع", "The farmer")}</option>
                  <option value="buyer">{t("المشتري", "The buyer")}</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {step("resume", t("يستمرّ العقد", "The contract continues"))}
              {step("close_done", t("أقفله تامّاً", "Close it as done"), ghost)}
              {step("close_cancel", t("ألغِه", "Cancel it"), ghost)}
            </div>
          </form>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-bold">{t("ما جرى على العقد", "What happened to the contract")}</h2>
        <ol className="mt-3 grid gap-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="border-s-2 border-border ps-3">
              <span className="text-muted">{date(e.at)}</span> · {tr(locale, ...(FORWARD_EVENT_LABEL[e.event] ?? [e.event, e.event]))}
              {e.event !== "proposed" && <span className="text-muted"> ({actor(e.actor_id)})</span>}
              {e.note && <p className="mt-0.5 text-muted">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
