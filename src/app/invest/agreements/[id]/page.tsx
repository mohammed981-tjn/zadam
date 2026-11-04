import Link from "next/link";
import { openPartnershipConversation } from "@/app/messages/actions";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import ActionNotice from "@/components/ActionNotice";
import NoCopy from "@/components/invest/NoCopy";
import SignaturePad from "@/components/invest/SignaturePad";
import HarvestSplitCalculator from "@/components/invest/HarvestSplitCalculator";
import InvestorStatementCard from "@/components/books/InvestorStatementCard";
import LinkProposalForms from "@/components/books/LinkProposalForms";
import { investorStatement, reversalAction } from "@/lib/ledgerLinks";
import { loadLinks } from "@/lib/ledgerLinksLoad";
import { ledgerToday } from "@/lib/ledger/today";
import {
  AGREEMENT_ITEMS,
  AGREEMENT_TITLE,
  ITEM_LABEL,
  LOSS_RULE_LABEL,
  LOSS_RULES,
  RENT_SCHEDULE_LABEL,
  RENT_SCHEDULES,
  agreementClauses,
  signerRoles,
  type AgreementSignature,
  type AgreementView,
} from "@/lib/agreements";
import { button, card, field, label } from "@/lib/ui";
import { saveAgreement, signAgreement } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  // A private page between two people: never indexed, never previewed.
  return { title: tr(locale, "عقد الشراكة | سوداقري", "Partnership agreement | Sudagri"), robots: { index: false, follow: false } };
}

/**
 * عقد الشراكة — يُكتب ويُقرأ ويُوقَّع هنا (البند ١٢٧).
 *
 * Both parties write the terms in the form, read the contract built from those
 * terms, and sign it with a finger and their full name. A save after a
 * signature starts a new version the old signature does not carry; two
 * signatures on one version seal it with a reference and a fingerprint. The
 * page offers no download and resists copying — the agreement lives here.
 */
export default async function AgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const lbl = (b: { ar: string; en: string }) => tr(locale, b.ar, b.en);

  const { data, error } = await supabase.rpc("partnership_agreement_view", { p_agreement: id });
  if (error || !data) notFound();
  const a = data as AgreementView;

  const x = a.terms;
  const signed = a.status === "signed";
  // The seasons that carry out this agreement (backlog 129): the owner's own,
  // and the investor's to read once it is signed.
  const { data: seasonRows } = signed
    ? await supabase.from("seasons").select("id, name, status").eq("partnership_id", a.id).order("planting_date", { ascending: false })
    : { data: null };
  const seasons = (seasonRows ?? []) as { id: string; name: string; status: string }[];
  // The entries the two partners proposed and confirmed between their books (backlog 188).
  const party = signed && (a.me === "owner" || a.me === "investor");
  const agreementLinks = party ? (await loadLinks(supabase)).filter((l) => l.agreement_id === a.id) : [];
  const statement = investorStatement(agreementLinks);
  const pendingLinks = agreementLinks.filter((l) => l.status === "pending" || reversalAction(l) === "answer");
  const mine = a.signatures.find((s) => s.role === a.me);
  // Two parties, or three when a partner company manages (backlog 136).
  const roles = signerRoles(a.model);
  const waiting = roles.filter((r) => !a.signatures.some((s) => s.role === r));
  const managed = a.model === "managed";
  // The verified, active partner companies a three-party agreement can name.
  const { data: companyRows } =
    managed && !signed && (a.me === "owner" || a.me === "investor")
      ? await supabase.from("partner_companies").select("id, name, states").not("verified_at", "is", null).eq("active", true).order("name")
      : { data: null };
  const companies = (companyRows ?? []) as { id: string; name: string; states: string[] }[];
  const clauses = agreementClauses(a, locale);
  // Arabic digits inside Arabic sentences, as the clauses already write them.
  const arNum = (v: number) => Number(v).toLocaleString("ar-EG");
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-EG", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Africa/Khartoum",
    });
  const who = (role: AgreementSignature["role"]) =>
    role === "owner"
      ? t("صاحب الأرض", "The landowner")
      : role === "investor"
        ? t("المستثمر", "The investor")
        : t("الشركة المديرة", "The managing company");
  const itemOwner = (i: (typeof AGREEMENT_ITEMS)[number]) =>
    x.owner_provides?.includes(i)
      ? "owner"
      : x.investor_provides?.includes(i)
        ? "investor"
        : // In a musaqah the standing trees are what is let: the owner's from the start.
          a.model === "musaqah" && i === "trees" && !x.owner_provides
          ? "owner"
          : "none";
  // The orchard's two items belong to a musaqah; a sown field has neither.
  const items = AGREEMENT_ITEMS.filter((i) => a.model === "musaqah" || (i !== "trees" && i !== "pruning"));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={a.me === "owner" ? "/lands" : a.me === "manager" ? "/partners/mine" : "/invest/mine"}
        className="text-sm font-bold text-primary underline"
      >
        {a.me === "owner" ? t("← أراضيّ", "← My land") : a.me === "manager" ? t("← شركتي", "← My company") : t("← طلباتي", "← My requests")}
      </Link>

      <header className="mt-4 mb-5">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-rose/10 px-3 py-1 text-xs font-bold text-rose">
          {signed
            ? managed
              ? t("موقَّعٌ من الأطراف الثلاثة ومقفل", "Signed by all three parties and sealed")
              : t("موقَّعٌ من الطرفين ومقفل", "Signed by both parties and sealed")
            : t(`مسوّدة — النسخة ${arNum(a.version)}`, `Draft — version ${a.version}`)}
        </p>
        <h1 className="title-bar font-black leading-tight" style={{ fontSize: "var(--text-title)" }}>
          {lbl(AGREEMENT_TITLE[a.model])}
        </h1>
        {signed && a.ref && (
          <p className="mt-2 text-sm font-bold text-leaf">
            {t("رقم العقد:", "Reference:")} <bdi dir="ltr">{a.ref}</bdi>
          </p>
        )}
        {/* صندوق الرسائل (البند ١٣٧): محادثة العقد هي محادثة طلبه. */}
        <form action={openPartnershipConversation} className="mt-3">
          <input type="hidden" name="agreement_id" value={a.id} />
          <input type="hidden" name="from" value={`/invest/agreements/${a.id}`} />
          <button className="text-sm font-bold text-primary underline">{t("💬 محادثة الشراكة", "💬 The partnership conversation")}</button>
        </form>
      </header>

      <ActionNotice ok={sp.ok} error={sp.error} />

      {/* ── نصّ العقد ─────────────────────────────────────────────────── */}
      <NoCopy
        printNote={t(
          "عقد الشراكة محفوظٌ في سوداقري ويُقرأ من صفحته. لنسخةٍ رسميّة مختومة اطلبها من سوداقري.",
          "This agreement is kept in Sudagri and read on its page. Ask Sudagri for a stamped official copy.",
        )}
      >
        <article className="rounded-3xl bg-card p-5 shadow-card ring-1 ring-border sm:p-7">
          <ol className="flex flex-col gap-4">
            {clauses.map((c, i) => (
              <li key={c.title}>
                <h2 className="flex items-baseline gap-2 font-black">
                  <span className="text-primary">{(i + 1).toLocaleString(locale === "en" ? "en-US" : "ar-EG")}.</span>
                  {c.title}
                </h2>
                {c.body.map((b, j) => (
                  <p key={j} className="mt-1 text-sm leading-7 [overflow-wrap:anywhere]">
                    {b}
                  </p>
                ))}
              </li>
            ))}
          </ol>

          {/* ── التواقيع ── */}
          <div className={`mt-6 grid gap-4 border-t border-border pt-5 ${managed ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {roles.map((role) => {
              const s = a.signatures.find((g) => g.role === role);
              return (
                <div key={role} className="rounded-2xl bg-background p-4">
                  <p className="text-xs font-bold text-muted">{who(role)}</p>
                  {s ? (
                    <>
                      <svg viewBox="0 0 600 200" className="mt-1 h-20 w-full text-foreground" aria-label={t("التوقيع", "Signature")}>
                        <path d={s.signature} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-sm font-bold">{s.full_name}</p>
                      <p className="text-xs text-muted">{fmt(s.signed_at)}</p>
                    </>
                  ) : (
                    <p className="mt-6 text-sm text-muted">{t("لم يوقّع بعد", "Not signed yet")}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── الشهادة ── */}
          {signed && a.signed_at ? (
            <div className="mt-5 rounded-2xl border-2 border-leaf/40 bg-leaf/5 p-4 text-center">
              <p className="font-black text-leaf">{t("شهدت سوداقري", "Witnessed by Sudagri")}</p>
              <p className="mt-1 text-xs leading-6 text-muted">
                {managed
                  ? t(
                      `وقّع الأطراف الثلاثة النسخة ${arNum(a.version)} من هذا العقد بحساباتهم، وأُقفل في ${fmt(a.signed_at)}.`,
                      `All three parties signed version ${a.version} of this agreement from their own accounts; sealed on ${fmt(a.signed_at)}.`,
                    )
                  : t(
                      `وقّع الطرفان النسخة ${arNum(a.version)} من هذا العقد بحسابيهما، وأُقفل في ${fmt(a.signed_at)}.`,
                      `Both parties signed version ${a.version} of this agreement from their own accounts; sealed on ${fmt(a.signed_at)}.`,
                    )}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {t("بصمة العقد:", "Fingerprint:")}{" "}
                <bdi dir="ltr" className="font-mono">{a.terms_hash.slice(0, 16)}…{a.terms_hash.slice(-8)}</bdi>
              </p>
            </div>
          ) : (
            <p className="mt-5 text-center text-[11px] text-muted">
              {t("بصمة هذه النسخة:", "This version's fingerprint:")}{" "}
              <bdi dir="ltr" className="font-mono">{a.terms_hash.slice(0, 16)}…</bdi>
              {a.earlier_signatures > 0 &&
                t(" — عُدِّلت البنود بعد توقيعٍ سابق، فيلزم التوقيع من جديد.", " — the terms changed after an earlier signature, so both must sign again.")}
            </p>
          )}
        </article>
      </NoCopy>

      {/* ── قسمة الحصاد: حاسبة بنصّ العقد (البند ١٨٨) ───────────────────── */}
      <section className={`${card} mt-6`}>
        <details>
          <summary className="cursor-pointer font-black">{t("كيف يُقسم الحصاد؟ (حاسبة)", "How will the harvest be split? (calculator)")}</summary>
          <HarvestSplitCalculator
            model={a.model}
            ownerShare={x.owner_share}
            investorShare={x.investor_share}
            managerShare={x.manager_share}
            rentHint={a.model === "lease" && x.rent_amount ? `${Number(x.rent_amount).toLocaleString("en-US")} ${x.currency ?? ""}` : undefined}
            names={{ owner: a.owner_name ?? "", investor: a.investor_name ?? "", manager: a.manager_name ?? "" }}
          />
        </details>
      </section>

      {/* ── من العقد إلى الموسم (البند ١٢٩) ─────────────────────────────── */}
      {signed && (a.me === "owner" || a.me === "investor") && (
        <section className={`${card} mt-6 text-sm`}>
          <h2 className="font-black">{t("الموسم", "The season")}</h2>
          {seasons.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {seasons.map((s) => (
                <li key={s.id}>
                  <Link href={`/seasons/${s.id}`} className="font-bold text-primary underline">
                    {s.name}
                  </Link>
                  <span className="text-muted">
                    {" "}
                    · {s.status === "completed" ? t("مكتمل", "Completed") : t("جارٍ", "In progress")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted">
              {a.me === "owner"
                ? t(
                    "ابدأ الموسم على أرض العقد: تُولَّد مراحله بتواريخها، وتسجّل فيها الصور والمصروفات، فيقرؤها شريكك.",
                    "Start the season on the agreement's land: its stages are generated with their dates, you record photos and spending in them, and your partner reads them.",
                  )
                : t(
                    "حين يبدأ صاحب الأرض الموسم يظهر هنا، فتقرأ مراحله وصوره ودفتره.",
                    "Once the landowner starts the season it appears here, and you read its stages, photos and ledger.",
                  )}
            </p>
          )}
          {a.me === "owner" && (
            <Link href={`/seasons/new?agreement=${a.id}`} className={`${button} mt-3 inline-block`}>
              {seasons.length > 0 ? t("ابدأ موسماً آخر من العقد", "Start another season from the agreement") : t("ابدأ الموسم", "Start the season")}
            </Link>
          )}
        </section>
      )}

      {/* ── الحساب بين الشريكين: قيودٌ متقابلة يؤكّدها الطرفان (البند ١٨٨) ──────── */}
      {party && (a.me === "owner" || a.me === "investor") && (
        <section className={`${card} mt-6 text-sm`}>
          <h2 className="font-black">{t("الحساب بينكما", "The account between you")}</h2>
          <InvestorStatementCard st={statement} locale={locale} role={a.me} />
          {pendingLinks.length > 0 && (
            <p className="mt-3">
              <Link href="/books?r=links" className="font-bold text-primary underline">
                {t(`${arNum(pendingLinks.length)} اقتراحٌ أو طلب إلغاءٍ معلّق ← افتحها`, `${pendingLinks.length} pending proposal(s) or cancellation request(s) → open them`)}
              </Link>
            </p>
          )}
          <LinkProposalForms
            agreementId={a.id}
            role={a.me}
            model={a.model}
            seasons={seasons}
            links={agreementLinks}
            today={ledgerToday()}
            locale={locale}
          />
        </section>
      )}

      {/* ── التوقيع ─────────────────────────────────────────────────────── */}
      {!signed && a.me !== "admin" && (
        <section className={`${card} mt-6`}>
          {mine ? (
            <p className="text-sm">
              <span className="font-bold text-leaf">{t("✓ وقّعتَ هذه النسخة.", "✓ You have signed this version.")}</span>{" "}
              {waiting.length > 0 &&
                t(
                  `بقي توقيع: ${waiting.map((r) => who(r)).join("، ")} — ووصله إشعار.`,
                  `Still to sign: ${waiting.map((r) => who(r)).join(", ")} — notified.`,
                )}
            </p>
          ) : (
            <form action={signAgreement} className="flex flex-col gap-4">
              <h2 className="font-black">{t("وقّع العقد", "Sign the agreement")}</h2>
              <input type="hidden" name="agreement_id" value={a.id} />
              <input type="hidden" name="version" value={a.version} />
              <input type="hidden" name="hash" value={a.terms_hash} />
              <label className={label}>
                {t("اسمك الكامل كما في إثبات هويّتك", "Your full name, as on your ID")}
                <input name="full_name" required minLength={5} maxLength={120} className={field} autoComplete="name" />
              </label>
              <SignaturePad />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="agree" value="yes" required className="mt-1 size-4" />
                {t(
                  "قرأتُ العقد كاملاً وأوافق على بنوده، وأعلم أنّ سوداقري تحفظه وتشهد عليه ولا تمسك مالاً ولا تضمن ربحاً.",
                  "I have read the whole agreement and accept its terms; I understand Sudagri keeps and witnesses it, holds no money and guarantees no profit.",
                )}
              </label>
              <button className={`${button} self-start`}>{t("أوقّع", "Sign")}</button>
            </form>
          )}
        </section>
      )}

      {/* ── تعديل البنود ───────────────────────────────────────────────── */}
      {/* The terms are written by the landowner and the investor; a managing company reads and signs them. */}
      {!signed && (a.me === "owner" || a.me === "investor") && (
        <details className={`${card} mt-6`} open={a.version === 1}>
          <summary className="cursor-pointer font-black text-primary">
            {a.version === 1 ? t("اكتبا بنود العقد", "Write the terms") : t("عدّل البنود", "Edit the terms")}
          </summary>
          <p className="mt-2 text-xs leading-6 text-muted">
            {t(
              "كلّ حفظٍ نسخةٌ جديدة يصل الطرفَ الآخر إشعارٌ بها، وأيّ توقيعٍ على نسخةٍ سابقة لا يُحسب حتى يوقّع الطرفان النسخة نفسها.",
              "Every save is a new version and the other party is notified; a signature on an earlier version stops counting until both sign the same one.",
            )}
          </p>
          <form action={saveAgreement} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="agreement_id" value={a.id} />
            <input type="hidden" name="model" value={a.model} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                {t("المحصول أو النشاط", "Crop or activity")}
                <input name="crop" required maxLength={80} defaultValue={x.crop ?? ""} className={field} placeholder={t("مثال: قمح", "e.g. wheat")} />
              </label>
              <label className={label}>
                {t("الموسم", "Season")}
                <input name="season" required maxLength={80} defaultValue={x.season ?? ""} className={field} placeholder={t("مثال: الموسم الشتوي ٢٠٢٦/٢٧", "e.g. winter 2026/27")} />
              </label>
              <label className={label}>
                {t("من تاريخ", "From")}
                <input type="date" name="start_date" required defaultValue={x.start_date ?? ""} className={field} />
              </label>
              <label className={label}>
                {t("إلى تاريخ", "To")}
                <input type="date" name="end_date" required defaultValue={x.end_date ?? ""} className={field} />
              </label>
              <label className={label}>
                {t(`المساحة المشمولة (فدان، حتى ${arNum(a.land.feddans)})`, `Area covered (feddans, up to ${a.land.feddans})`)}
                <input type="number" name="feddans" required min={0.1} step="0.1" max={a.land.feddans} defaultValue={x.feddans ?? a.land.feddans} className={field} />
              </label>
            </div>

            <fieldset className="rounded-2xl bg-background p-3">
              <legend className="px-1 text-sm font-bold">{t("من يقدّم ماذا", "Who provides what")}</legend>
              <div className="mt-1 flex flex-col divide-y divide-border">
                {items.map((i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-medium">{lbl(ITEM_LABEL[i])}</span>
                    <span className="flex gap-3">
                      {(["owner", "investor", "none"] as const).map((w) => (
                        <label key={w} className="flex items-center gap-1">
                          <input type="radio" name={`item_${i}`} value={w} defaultChecked={itemOwner(i) === w} className="size-4" />
                          {w === "owner" ? t("صاحب الأرض", "Owner") : w === "investor" ? t("المستثمر", "Investor") : t("لا ينطبق", "N/A")}
                        </label>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </fieldset>

            {managed && (
              <>
                <label className={label}>
                  {t("الشركة الشريكة التي تدير الزراعة", "The partner company that will manage the farming")}
                  <select name="manager_company" required defaultValue={x.manager_company ?? ""} className={field}>
                    <option value="" disabled>
                      {t("اختر شركةً موثّقة", "Choose a verified company")}
                    </option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.states.join("، ")}
                      </option>
                    ))}
                  </select>
                  {companies.length === 0 && (
                    <span className="text-xs text-muted">
                      {t("لا شركة شريكة موثّقة بعد. تجدها في «الشركات الزراعيّة الشريكة» حين توثَّق.", "No verified partner company yet; they appear under partner companies once verified.")}
                    </span>
                  )}
                </label>
                <label className={label}>
                  {t("حصّة الشركة المديرة من صافي الربح (٪، حتى ٥٠)", "The managing company's share of the net profit (%, up to 50)")}
                  <input type="number" name="manager_share" required min={1} max={50} step="1" defaultValue={x.manager_share ?? ""} className={field} />
                </label>
              </>
            )}
            {(a.model === "sharecrop" || a.model === "finance" || a.model === "musaqah" || managed) && (
              <label className={label}>
                {a.model === "musaqah"
                  ? t("حصّة صاحب الأرض من الثمر (٪) — والباقي للمستثمر", "Landowner's share of the fruit (%) — the rest is the investor's")
                  : managed
                    ? t("حصّة صاحب الأرض ممّا يبقى من صافي الربح بعد حصّة الشركة (٪) — والباقي للمستثمر", "Landowner's share of what remains of the net profit after the company's (%) — the rest is the investor's")
                    : t("حصّة صاحب الأرض من المحصول (٪) — والباقي للمستثمر", "Landowner's share of the crop (%) — the rest is the investor's")}
                <input type="number" name="owner_share" required min={1} max={99} step="1" defaultValue={x.owner_share ?? ""} className={field} />
              </label>
            )}
            {a.model === "lease" && (
              <>
                <label className={label}>
                  {t("الأجرة عن المدّة كلّها", "Rent for the whole term")}
                  <input type="number" name="rent_amount" required min={1} step="any" defaultValue={x.rent_amount ?? ""} className={field} />
                </label>
                <fieldset className="flex flex-col gap-1 text-sm">
                  <legend className="mb-1 font-bold">{t("موعد دفع الأجرة", "When the rent is paid")}</legend>
                  {RENT_SCHEDULES.map((s) => (
                    <label key={s} className="flex items-center gap-2">
                      <input type="radio" name="rent_schedule" value={s} required defaultChecked={x.rent_schedule === s} className="size-4" />
                      {lbl(RENT_SCHEDULE_LABEL[s])}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {a.model === "finance" && (
              <label className={label}>
                {t("أقصى مبلغ للتمويل", "Maximum finance amount")}
                <input type="number" name="finance_amount" required min={1} step="any" defaultValue={x.finance_amount ?? ""} className={field} />
              </label>
            )}
            {(a.model === "lease" || a.model === "finance") && (
              <fieldset className="flex gap-4 text-sm">
                <legend className="mb-1 font-bold">{t("العملة", "Currency")}</legend>
                {(["SDG", "USD"] as const).map((c) => (
                  <label key={c} className="flex items-center gap-2">
                    <input type="radio" name="currency" value={c} required defaultChecked={(x.currency ?? "SDG") === c} className="size-4" />
                    {c === "SDG" ? t("جنيه سوداني", "Sudanese pound") : t("دولار أمريكي", "US dollar")}
                  </label>
                ))}
              </fieldset>
            )}

            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 font-bold">{t("إن خسر الموسم", "If the season loses")}</legend>
              {LOSS_RULES.map((r) => (
                <label key={r} className="flex items-start gap-2">
                  <input type="radio" name="loss_rule" value={r} required defaultChecked={(x.loss_rule ?? "by_contribution") === r} className="mt-1 size-4" />
                  <span className="leading-6">{lbl(LOSS_RULE_LABEL[r])}</span>
                </label>
              ))}
              <textarea name="loss_text" rows={2} maxLength={1000} defaultValue={x.loss_text ?? ""} className={field} placeholder={t("إن اخترت حكماً آخر فاكتبه هنا", "If you chose another rule, write it here")} />
            </fieldset>

            <label className={label}>
              {t("شروط إضافيّة (اختياري)", "Additional terms (optional)")}
              <textarea name="extra" rows={3} maxLength={2000} defaultValue={x.extra ?? ""} className={field} />
            </label>

            <button className={`${button} self-start`}>{t("احفظ البنود", "Save the terms")}</button>
          </form>
        </details>
      )}
    </div>
  );
}
