import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";
import PageHeader from "@/components/PageHeader";
import { button, card } from "@/lib/ui";
import { OFFER_UNIT_NAME, isNotYetCreated } from "@/lib/marketOffers";
import { FORWARD_OPEN, FORWARD_STATUS_LABEL, type ForwardContract } from "@/lib/forwardContracts";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "العقود الآجلة | سوداقري", "Forward contracts | Sudagri") };
}

/**
 * «العقود الآجلة» (البند ١٧٠، الغنيمة ٨ من Mozare3): سعرٌ معروفٌ قبل الحصاد. يشرح للزائر ما هو، ويعرض لصاحب الحساب
 * عقوده مفتوحةً ومقفلة.
 */
export default async function ForwardContractsPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = user
    ? await supabase.from("forward_contracts").select("*").order("proposed_at", { ascending: false }).limit(200)
    : { data: null, error: null };
  const pending = isNotYetCreated(error);
  if (error && !pending) console.error("forward: list failed", error.message);
  const all = ((data ?? []) as ForwardContract[]).filter((c) => user && (c.buyer_id === user.id || c.farmer_id === user.id));
  // The administration reads every contract; what waits for it is the disputes (the review list links here).
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  const isAdmin = (profile as { role: string } | null)?.role === "admin";
  const { data: disputeRows } = isAdmin
    ? await supabase.from("forward_contracts").select("*").eq("status", "disputed").order("updated_at")
    : { data: null };
  const disputes = (disputeRows ?? []) as ForwardContract[];
  const open = all.filter((c) => FORWARD_OPEN.includes(c.status));
  const closed = all.filter((c) => !FORWARD_OPEN.includes(c.status));
  const money = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const date = (d: string) => new Date(d).toLocaleDateString(en ? "en-GB" : "ar-EG", { dateStyle: "medium" });

  const row = (c: ForwardContract) => {
    const side =
      c.buyer_id === user!.id
        ? t("أنت المشتري", "You are the buyer")
        : c.farmer_id === user!.id
          ? t("أنت المزارع", "You are the farmer")
          : t("نزاعٌ ينتظر الإدارة", "A dispute awaiting the administration");
    const waitingForMe =
      (c.status === "proposed" && c.proposed_by !== user!.id) ||
      (c.status === "delivered" && c.farmer_id === user!.id) ||
      (c.status === "cancel_requested" && c.cancel_requested_by !== user!.id);
    return (
      <li key={c.id} className={`${card} ${waitingForMe ? "ring-2 ring-accent/50" : ""}`}>
        <Link href={`/market/forward/${c.id}`} className="block">
          <p className="text-xs text-muted">
            {c.ref} · {side} · {tr(locale, ...FORWARD_STATUS_LABEL[c.status])}
            {waitingForMe && <span className="ms-2 font-bold text-accent">{t("ينتظرك", "Waiting for you")}</span>}
          </p>
          <p className="mt-1 font-bold">
            {c.crop} · <span dir="ltr">{money(c.quantity)}</span> {en ? OFFER_UNIT_NAME[c.unit].en : OFFER_UNIT_NAME[c.unit].ar} ·{" "}
            <span dir="ltr">
              {money(c.price)} {c.currency}
            </span>{" "}
            {t("للوحدة", "per unit")}
          </p>
          <p className="text-sm text-muted">
            {t("التسليم: ", "Delivery: ")}
            {date(c.delivery_from)} – {date(c.delivery_to)} · {c.delivery_place}
          </p>
        </Link>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader icon="chart" eyebrow={t("السوق", "Market")} title={t("العقود الآجلة", "Forward contracts")}>
        {t(
          "يتّفق المشتري والمزارع قبل الحصاد على محصولٍ ودرجةٍ وكميّةٍ وسعرٍ وموعدِ تسليم: يعرف المزارع سعره قبل أن يحصد، ويعرف المشتري من أين تأتيه بضاعته. يقترحه أحدهما ويوقّعه الآخر، ولا تتغيّر شروطه بعد ذلك، ولا يُلغى إلا باتّفاقهما.",
          "Before the harvest, the buyer and the farmer agree a crop, a grade, a quantity, a price and a delivery date: the farmer knows the price before harvesting, and the buyer knows where the goods will come from. One proposes and the other signs; the terms do not change afterwards, and it is cancelled only if both agree.",
        )}
      </PageHeader>

      <p className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm leading-7">
        {t(
          "المنصّة تكتب العقد وتحفظ توقيعيه وكلّ ما جرى عليه، ولا تحمل مالاً ولا تضمن تسليماً ولا سداداً: الدفع بينكما مباشرةً كما كتبتما. وإن اختلفتما تسمع الإدارة الطرفين وتكتب ما فصلت به.",
          "The platform writes the contract and keeps both signatures and everything that happens to it. It holds no money and guarantees neither delivery nor payment: you pay each other directly as you wrote. If you disagree, the administration hears both sides and writes down its decision.",
        )}
      </p>

      {!user ? (
        <Link href={loginTo("/market/forward")} className={`${button} mt-6 inline-block`}>
          {t("ادخل لتقترح عقداً أو ترى عقودك", "Sign in to propose a contract or see yours")}
        </Link>
      ) : pending ? (
        <p className="mt-6 text-muted">{t("تُفعَّل العقود الآجلة قريباً.", "Forward contracts are coming soon.")}</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/market/forward/new" className={button}>
              {t("اقترح عقداً آجلاً", "Propose a forward contract")}
            </Link>
            <Link href="/market/offers" className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold">
              {t("أو ابدأ من عرضٍ في السوق", "Or start from a market offer")}
            </Link>
          </div>
          {disputes.length > 0 && (
            <section className="mt-8">
              <h2 className="font-bold">{t("نزاعاتٌ تنتظر الإدارة", "Disputes awaiting the administration")}</h2>
              <ul className="mt-3 grid gap-3">{disputes.map(row)}</ul>
            </section>
          )}
          <section className="mt-8">
            <h2 className="font-bold">{t("عقودي المفتوحة", "My open contracts")}</h2>
            {open.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("لا شيء الآن.", "None now.")}</p>
            ) : (
              <ul className="mt-3 grid gap-3">{open.map(row)}</ul>
            )}
          </section>
          {closed.length > 0 && (
            <section className="mt-8">
              <h2 className="font-bold">{t("ما أُقفل", "Closed")}</h2>
              <ul className="mt-3 grid gap-3">{closed.map(row)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
