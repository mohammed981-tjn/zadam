import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ActionNotice from "@/components/ActionNotice";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";
import { button, card, field, ghost, label } from "@/lib/ui";
import { serviceUnitLabel, type ServiceUnit } from "@/lib/services";
import { dateLabel, num } from "@/lib/supplyChain";
import { ledgerToday } from "@/lib/ledger/today";
import {
  AVAILABILITY_FRESH_DAYS,
  BOOKING_STATUS_LABEL,
  availabilityState,
  bookingProgress,
  type BookingRow,
} from "@/lib/machinery";
import { decideBooking, joinBooking, leaveBooking, openBooking, requestBooking } from "./actions";

/**
 * احجز جرّاراً مع جيرانك (البند ١٦٨).
 *
 * One farmer opens a booking on a verified mechanisation provider who has confirmed being available in the last two
 * weeks; the neighbours in the same locality (read from the land each season is tied to) join with their own seasons;
 * once the total reaches the provider's minimum the organiser sends it, and the provider accepts or declines it whole.
 * Each member's part is an ordinary service contract from the moment they join, so after acceptance everything —
 * phases, proof, completion — runs on the contracts page as any other contract. No money and no phone number here.
 */

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "احجز جرّاراً مع جيرانك — سوداقري", "Book a tractor with your neighbours — Sudagri") };
}

type SP = { ok?: string; error?: string };
type Season = { id: string; name: string; feddans: number; land_id: string | null };
type Offer = { id: string; provider_id: string; title: string; unit: ServiceUnit; price_per_unit: number; min_units: number; lead_time_days: number };
type Provider = { id: string; name: string; kind: string; available: boolean; availability_confirmed_at: string | null };
type Member = { display_name: string; quantity: number; joined_at: string };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function MachineryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/services/machinery"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const today = ledgerToday();

  const [bookingsRes, seasonsRes, providersRes, offersRes, profileRes] = await Promise.all([
    supabase.rpc("machinery_bookings_list"),
    supabase.from("seasons").select("id, name, feddans, land_id").eq("owner_id", user.id).neq("status", "completed").order("created_at"),
    supabase.from("service_providers").select("id, name, kind, available, availability_confirmed_at").eq("kind", "mechanization"),
    supabase.from("services").select("id, provider_id, title, unit, price_per_unit, min_units, lead_time_days").eq("active", true),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const bookings = (bookingsRes.data ?? []) as BookingRow[];
  const seasons = ((seasonsRes.data ?? []) as Season[]).filter((s) => s.land_id);
  const seasonsWithoutLand = ((seasonsRes.data ?? []) as Season[]).length - seasons.length;
  const providers = new Map(((providersRes.data ?? []) as Provider[]).map((p) => [p.id, p]));
  const offers = ((offersRes.data ?? []) as Offer[]).filter((o) => {
    const p = providers.get(o.provider_id);
    return p && availabilityState(p.available, p.availability_confirmed_at) === "fresh";
  });
  const myName = (profileRes.data as { full_name?: string } | null)?.full_name ?? "";

  const mine = bookings.filter((b) => b.my_quantity !== null || b.is_organiser);
  const providing = bookings.filter((b) => b.is_provider);
  const open = bookings.filter((b) => b.status === "open" && b.my_quantity === null && !b.is_organiser && !b.is_provider);

  // Who is in a booking, for the bookings where the person may see it (the function itself decides; it returns nothing otherwise).
  const memberLists = new Map<string, Member[]>();
  await Promise.all(
    [...mine.filter((b) => b.is_organiser), ...providing.filter((b) => b.status !== "open")].map(async (b) => {
      const { data } = await supabase.rpc("machinery_booking_members", { p_booking: b.id });
      memberLists.set(b.id, (data ?? []) as Member[]);
    }),
  );

  const unit = (u: string) => serviceUnitLabel(u as ServiceUnit, locale);
  const seasonOptions = seasons.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name} — {num(s.feddans, locale)} {t("فدان", "feddan")}
    </option>
  ));

  const summary = (b: BookingRow) => {
    const pr = bookingProgress(b.total, b.min_units);
    return (
      <>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">
            <bdi>{b.service_title}</bdi> — <bdi>{b.provider_name}</bdi>
          </h3>
          <span className="text-xs text-muted">{t(BOOKING_STATUS_LABEL[b.status].ar, BOOKING_STATUS_LABEL[b.status].en)}</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          <bdi>{b.locality}</bdi>، <bdi>{b.state}</bdi> · {dateLabel(b.window_from, locale)} – {dateLabel(b.window_to, locale)} ·{" "}
          {num(b.unit_price, locale, 0)} {t("جنيه", "SDG")} / {unit(b.unit)}
        </p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={Math.round(pr.pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary" style={{ width: `${pr.pct}%` }} />
        </div>
        <p className="figure mt-1 text-xs text-muted">
          {t(
            `${num(b.total, locale)} من ${num(b.min_units, locale)} ${unit(b.unit)} · ${num(b.members, locale, 0)} مزارع`,
            `${num(b.total, locale)} of ${num(b.min_units, locale)} ${unit(b.unit)} · ${num(b.members, locale, 0)} farmers`,
          )}
          {!pr.enough &&
            b.status === "open" &&
            t(` — ينقصه ${num(pr.remaining, locale)} ليُرسل`, ` — ${num(pr.remaining, locale)} short of sending`)}
        </p>
        {b.status === "declined" && b.decline_reason && (
          <p className="mt-2 text-sm">
            {t("سبب الاعتذار:", "Reason:")} <bdi>{b.decline_reason}</bdi>
          </p>
        )}
      </>
    );
  };

  const members = (b: BookingRow) => {
    const list = memberLists.get(b.id) ?? [];
    if (list.length === 0) return null;
    return (
      <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-2 text-sm">
        {list.map((m, i) => (
          <li key={i} className="flex justify-between gap-2">
            <bdi>{m.display_name}</bdi>
            <span className="figure">
              {num(m.quantity, locale)} {unit(b.unit)}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/services" className="text-sm text-primary underline">
        {t("← الخدمات التعاقديّة", "← Contracted services")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{t("احجز جرّاراً مع جيرانك", "Book a tractor with your neighbours")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          `الجرّار يُستأجر ولا يُشترى، والوقود شحيح، فيأتي حين تجتمع أرضٌ تكفيه في محليّةٍ واحدة. افتح حجزاً على مقدّم ميكنةٍ موثّق أكّد توفّره خلال آخر ${AVAILABILITY_FRESH_DAYS} يوماً، فيراه جيرانك في محليّتك وينضمّون بمواسمهم. حين يبلغ المجموع الحدّ الأدنى للخدمة يرسله المنظّم، ويقبله مقدّم الخدمة كلّه أو يعتذر عنه كلّه. ونصيب كلّ مزارعٍ عقد خدمةٍ عاديّ باسمه، والدفع خارج المنصّة كما في كلّ عقد.`,
          `A tractor is hired, not bought, and fuel is scarce — so it comes when enough land gathers in one locality. Open a booking on a verified mechanisation provider who confirmed being available in the last ${AVAILABILITY_FRESH_DAYS} days; your neighbours in the same locality see it and join with their seasons. When the total reaches the service's minimum the organiser sends it, and the provider accepts or declines it whole. Each farmer's share is an ordinary service contract in their own name, and payment happens outside the platform as with every contract.`,
        )}
      </p>

      <div className="mt-6">
        <ActionNotice ok={sp.ok} error={sp.error} />
      </div>

      {providing.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{t("حجوزاتٌ على جهتك", "Bookings on your organisation")}</h2>
          <ul className="flex flex-col gap-3">
            {providing.map((b) => (
              <li key={b.id} className={card}>
                {summary(b)}
                {members(b)}
                {b.status === "requested" && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
                    <form action={decideBooking}>
                      <input type="hidden" name="booking_id" value={b.id} />
                      <input type="hidden" name="accept" value="true" />
                      <button className={button}>{t("اقبل الحجز كلّه", "Accept the whole booking")}</button>
                    </form>
                    <form action={decideBooking} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <input type="hidden" name="booking_id" value={b.id} />
                      <input type="hidden" name="accept" value="false" />
                      <label className={`${label} flex-1`}>
                        {t("أو اعتذر، واكتب السبب (يقرؤه المزارعون)", "Or decline, with a reason (the farmers read it)")}
                        <input name="reason" required minLength={3} maxLength={300} className={field} />
                      </label>
                      <button className={ghost}>{t("اعتذر", "Decline")}</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("حجوزاتي", "My bookings")}</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">{t("لم تنضمّ إلى حجزٍ بعد.", "You have not joined a booking yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {mine.map((b) => {
              const pr = bookingProgress(b.total, b.min_units);
              return (
                <li key={b.id} className={card}>
                  {summary(b)}
                  {b.my_quantity !== null && (
                    <p className="mt-2 text-sm">
                      {t("نصيبك:", "Your share:")} <strong className="figure">{num(b.my_quantity, locale)}</strong> {unit(b.unit)}
                      {b.is_organiser && t(" · أنت المنظّم", " · you organise it")}
                    </p>
                  )}
                  {members(b)}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {b.is_organiser && b.status === "open" && pr.enough && (
                      <form action={requestBooking}>
                        <input type="hidden" name="booking_id" value={b.id} />
                        <button className={button}>{t("أرسل الحجز لمقدّم الخدمة", "Send the booking to the provider")}</button>
                      </form>
                    )}
                    {(b.status === "open" || b.status === "requested") && b.my_quantity !== null && (
                      <form action={leaveBooking}>
                        <input type="hidden" name="booking_id" value={b.id} />
                        <button className={ghost}>{t("انسحب من الحجز", "Leave the booking")}</button>
                      </form>
                    )}
                    {b.status === "accepted" && (
                      <Link href="/contracts" className="text-sm font-medium text-primary underline">
                        {t("عقدك في صفحة العقود ←", "Your contract is on the contracts page →")}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("حجوزاتٌ مفتوحة تنضمّ إليها", "Open bookings to join")}</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted">{t("لا حجز مفتوحاً الآن. افتح واحداً أدناه.", "No open booking right now. Open one below.")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((b) => (
              <li key={b.id} className={card}>
                {summary(b)}
                {seasons.length > 0 ? (
                  <form action={joinBooking} className="mt-4 grid gap-2 border-t border-border pt-3 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
                    <input type="hidden" name="booking_id" value={b.id} />
                    <label className={label}>
                      {t("موسمك", "Your season")}
                      <select name="season_id" required className={field}>
                        {seasonOptions}
                      </select>
                    </label>
                    <label className={label}>
                      {t("الكمّيّة", "Quantity")} ({unit(b.unit)})
                      <input name="quantity" type="number" required min={0.1} step="any" className={field} />
                    </label>
                    <label className={label}>
                      {t("اسمك كما يراه المنظّم ومقدّم الخدمة", "Your name for the organiser and the provider")}
                      <input name="display_name" required minLength={2} maxLength={60} defaultValue={myName} className={field} />
                    </label>
                    <button className={button}>{t("انضمّ", "Join")}</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          {t(
            "ينضمّ من كانت أرض موسمه في محليّة الحجز نفسها؛ وتظهر لك حجوزات المحليّات الأخرى ولا تنضمّ إليها.",
            "Only farmers whose season's land is in the booking's locality can join; bookings elsewhere are shown but not joinable.",
          )}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("افتح حجزاً", "Open a booking")}</h2>
        {seasonsWithoutLand > 0 && (
          <p className="mb-3 text-sm text-muted">
            {t(
              "مواسمك غير المربوطة بأرضٍ مسجّلة لا تظهر هنا: من الأرض تُعرف المحليّة التي يجتمع فيها الحجز.",
              "Seasons not tied to a registered land are not listed: the land is what tells the booking's locality.",
            )}
          </p>
        )}
        {offers.length === 0 ? (
          <p className="text-sm text-muted">
            {t(
              `لا مقدّم ميكنةٍ موثّقاً أكّد توفّره خلال آخر ${AVAILABILITY_FRESH_DAYS} يوماً.`,
              `No verified mechanisation provider has confirmed being available in the last ${AVAILABILITY_FRESH_DAYS} days.`,
            )}
          </p>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-muted">
            {t("تحتاج موسماً جارياً مربوطاً بأرضك لتفتح حجزاً.", "You need a current season tied to your land to open a booking.")}{" "}
            <Link href="/seasons" className="text-primary underline">
              {t("مواسمي", "My seasons")}
            </Link>
          </p>
        ) : (
          <form action={openBooking} className={`${card} grid gap-3 sm:grid-cols-2`}>
            <label className={`${label} sm:col-span-2`}>
              {t("الخدمة ومقدّمها", "Service and provider")}
              <select name="service_id" required className={field}>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {providers.get(o.provider_id)?.name} — {o.title} — {num(o.price_per_unit, locale, 0)} {t("جنيه", "SDG")} / {unit(o.unit)} ·{" "}
                    {t("الحدّ الأدنى", "minimum")} {num(o.min_units, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {t("موسمك", "Your season")}
              <select name="season_id" required className={field}>
                {seasonOptions}
              </select>
            </label>
            <label className={label}>
              {t("كمّيّتك", "Your quantity")}
              <input name="quantity" type="number" required min={0.1} step="any" className={field} />
            </label>
            <label className={label}>
              {t("من يوم", "From")}
              <input name="from" type="date" required min={today} defaultValue={addDays(today, 7)} className={field} />
            </label>
            <label className={label}>
              {t("إلى يوم", "To")}
              <input name="to" type="date" required min={today} defaultValue={addDays(today, 21)} className={field} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              {t("اسمك كما يراه المنظّم ومقدّم الخدمة (بلا رقم هاتف)", "Your name for the organiser and the provider (no phone number)")}
              <input name="display_name" required minLength={2} maxLength={60} defaultValue={myName} className={field} />
            </label>
            <button className={`${button} sm:col-span-2`}>{t("افتح الحجز", "Open the booking")}</button>
          </form>
        )}
      </section>
    </div>
  );
}
