import type { SupabaseClient } from "@supabase/supabase-js";
import { CHARTER_VERSION } from "@/lib/nafir";

/**
 * قائمةُ المراجعة — كلُّ ما ينتظر قرار الإدارة في مكانٍ واحد (البند ١٢٤).
 *
 * The owner, 21 October: «المشكلة أنا الإدارة أين أجدها؟ وجدتها فقط في
 * الإشعارات. المفروض تظهر للإدارة من قائمة مراجعة، وليس فقط الأرض — كلّ فرصة
 * تراجعها الإدارة».
 *
 * Fourteen queues lived on nine screens: four admin routes were missing from
 * the menu altogether (suppliers, carriers and product reports among them),
 * three sat outside /admin under the nafir pages, and nothing showed an
 * administrator a count. The way in was the notification — which marks itself
 * read and says nothing about whether the item was ever decided.
 *
 * Each queue below uses the same «waiting» condition as the screen that
 * decides it, so the number here and the list there agree. Reading is the
 * session client: every table has an `or is_admin()` read policy.
 *
 * A record returned with a reason (supplier, carrier, partner company) keeps
 * `verified_at` null exactly like a new one, so it counts as waiting here as it
 * does on its own screen — the columns cannot tell the two apart.
 */

export interface QueueItem {
  id: string;
  title: string;
  meta: string | null;
  at: string | null;
}

export interface QueueSection {
  key: string;
  title: { ar: string; en: string };
  /** What the decision is, in a line. */
  what: { ar: string; en: string };
  href: string;
  /** Informational queues are decided by someone else; they show but are not counted as the admin's. */
  info?: boolean;
  count: number | null;
  items: QueueItem[];
}

type Spec = Omit<QueueSection, "count" | "items"> & {
  table: string;
  select: string;
  filter: (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  order: string;
  row: (r: any) => QueueItem; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const SPECS: Spec[] = [
  // صندوق الرسائل (البند ١٤٤): «راسل سوداقري» حين تكون آخر كلمةٍ للعضو،
  // والمحادثات المبلَّغ عنها حتى يراجعها المدير ويغلق البلاغ.
  {
    key: "messages_waiting",
    title: { ar: "رسائل تنتظر ردّ الإدارة", en: "Messages awaiting the administration" },
    what: { ar: "اقرأ رسالة العضو وردّ عليه باسم سوداقري.", en: "Read the member's message and reply as Sudagri." },
    href: "/messages",
    table: "conversations",
    select: "id, kind, last_message_at",
    filter: (q) => q.eq("kind", "support").eq("needs_reply", true),
    order: "last_message_at",
    row: (r) => ({ id: r.id, title: "راسل سوداقري", meta: null, at: r.last_message_at }),
  },
  {
    key: "messages_reported",
    title: { ar: "محادثات مبلَّغ عنها", en: "Reported conversations" },
    what: { ar: "اقرأ المحادثة وسبب البلاغ، ثمّ «راجعتُ البلاغ — أغلقه».", en: "Read the thread and the reason, then close the report." },
    href: "/messages",
    table: "conversations",
    select: "id, kind, reported_at",
    filter: (q) => q.not("reported_at", "is", null),
    order: "reported_at",
    row: (r) => ({ id: r.id, title: r.kind === "support" ? "راسل سوداقري" : "محادثة شراكة", meta: null, at: r.reported_at }),
  },
  {
    key: "lands",
    title: { ar: "أراضٍ تنتظر التوثيق", en: "Land awaiting verification" },
    what: { ar: "راجع المستندات، ثمّ «وثّق وانشر» أو «ردّ» بالسبب.", en: "Check the documents, then verify or return with a reason." },
    href: "/admin/lands",
    table: "lands",
    select: "id, name, state, feddans, documents_on_file, documents_required, created_at",
    filter: (q) => q.in("verification", ["unverified", "submitted"]),
    order: "created_at",
    row: (r) => ({
      id: r.id,
      title: r.name,
      meta: `${r.state} · ${r.feddans} فدان · المستندات ${r.documents_on_file} من ${r.documents_required}`,
      at: r.created_at,
    }),
  },
  {
    key: "opportunities",
    title: { ar: "فرص استثمار مرفوعة", en: "Submitted opportunities" },
    what: { ar: "اعتمدها للنشر في صفحة المشاريع أو ردّها.", en: "Approve for the projects page or return it." },
    href: "/admin/review",
    table: "projects",
    select: "id, name, location, total_feddans, created_at",
    filter: (q) => q.eq("review_status", "submitted"),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.name, meta: `${r.location} · ${r.total_feddans} فدان`, at: r.created_at }),
  },
  {
    key: "providers",
    title: { ar: "مقدّمو خدمة ينتظرون التوثيق", en: "Service providers awaiting verification" },
    what: { ar: "التوثيق يُدخلهم الكتالوج ويسمح بالتعاقد معهم.", en: "Verification lists them and allows contracts." },
    href: "/admin/providers",
    table: "service_providers",
    select: "id, name, kind, created_at",
    filter: (q) => q.is("verified_at", null),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.name, meta: r.kind, at: r.created_at }),
  },
  {
    key: "partners",
    title: { ar: "شركات شريكة تنتظر التوثيق", en: "Partner companies awaiting verification" },
    what: { ar: "وثّقها أو ردّها بالسبب.", en: "Verify or return with a reason." },
    href: "/admin/partners",
    table: "partner_companies",
    select: "id, name, states, updated_at",
    filter: (q) => q.is("verified_at", null),
    order: "updated_at",
    row: (r) => ({ id: r.id, title: r.name, meta: (r.states ?? []).join(" · "), at: r.updated_at }),
  },
  {
    key: "partner_agreements",
    title: { ar: "اتّفاقات شركاء مسوّدة", en: "Draft partner agreements" },
    what: { ar: "فعّلها حتى تُعرض عليها الأراضي المطابقة.", en: "Activate so matching land is shown to the company." },
    href: "/admin/partners",
    table: "partner_agreements",
    select: "id, title, valid_until, created_at",
    filter: (q) => q.eq("status", "draft"),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.title, meta: `حتى ${r.valid_until}`, at: r.created_at }),
  },
  {
    key: "suppliers",
    title: { ar: "موردون ينتظرون التوثيق", en: "Suppliers awaiting verification" },
    what: { ar: "راجع الرخص، ثمّ وثّق أو ردّ بالسبب.", en: "Check the licences, then verify or return." },
    href: "/admin/suppliers",
    table: "suppliers",
    select: "id, name, state, updated_at",
    filter: (q) => q.is("verified_at", null),
    order: "updated_at",
    row: (r) => ({ id: r.id, title: r.name, meta: r.state, at: r.updated_at }),
  },
  {
    key: "carriers",
    title: { ar: "ناقلون ينتظرون التوثيق", en: "Carriers awaiting verification" },
    what: { ar: "وثّق الناقل أو ردّه بالسبب.", en: "Verify the carrier or return with a reason." },
    href: "/admin/suppliers",
    table: "carriers",
    select: "id, name, vehicle, created_at",
    filter: (q) => q.is("verified_at", null),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.name, meta: r.vehicle, at: r.created_at }),
  },
  {
    key: "reports",
    title: { ar: "بلاغات منتجات مشبوهة", en: "Suspicious product reports" },
    what: { ar: "افحص البلاغ وسجّل ما وجدت.", en: "Check the report and record what you found." },
    href: "/admin/suppliers#reports",
    table: "product_reports",
    select: "id, product_name, state, created_at",
    filter: (q) => q.eq("status", "new"),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.product_name, meta: r.state, at: r.created_at }),
  },
  {
    key: "export",
    title: { ar: "عروض تصدير مرفوعة", en: "Submitted export offers" },
    what: { ar: "راجع المستندات قبل النشر للمشترين.", en: "Check the documents before publishing to buyers." },
    href: "/admin/export",
    table: "export_offers",
    select: "id, reference, submitted_at",
    filter: (q) => q.eq("status", "submitted"),
    order: "submitted_at",
    row: (r) => ({ id: r.id, title: r.reference, meta: null, at: r.submitted_at }),
  },
  {
    key: "buyers",
    title: { ar: "طلبات مشترين جديدة", en: "New buyer requests" },
    what: { ar: "تواصل مع المشتري وسجّل ما تمّ.", en: "Contact the buyer and record the outcome." },
    href: "/admin/export/interests",
    table: "export_offer_interests",
    select: "id, buyer_name, buyer_country, created_at",
    filter: (q) => q.eq("status", "new"),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.buyer_name, meta: r.buyer_country, at: r.created_at }),
  },
  {
    key: "investments",
    title: { ar: "طلبات استثمار معلّقة", en: "Pending investments" },
    what: { ar: "تُؤكَّد من صفحة المشروع.", en: "Confirmed from the project's page." },
    href: "/admin",
    table: "investments",
    select: "id, shares, created_at",
    filter: (q) => q.eq("status", "pending"),
    order: "created_at",
    row: (r) => ({ id: r.id, title: `${r.shares} حصّة`, meta: null, at: r.created_at }),
  },
  {
    key: "feedback",
    title: { ar: "ملاحظات زوّار بلا ردّ", en: "Visitor feedback without a reply" },
    what: { ar: "اقرأها وردّ عليها.", en: "Read and reply." },
    href: "/admin/feedback",
    table: "feedback",
    select: "id, kind, body, created_at",
    filter: (q) => q.is("admin_reply", null),
    order: "created_at",
    row: (r) => ({ id: r.id, title: String(r.body ?? "").slice(0, 80), meta: r.kind, at: r.created_at }),
  },
  {
    key: "leaders",
    title: { ar: "قادة نفير ينتظرون التوثيق", en: "Nafir leaders awaiting verification" },
    what: { ar: "يوثَّقون من صفحة الميثاق.", en: "Verified on the charter page." },
    href: "/nafir/charter",
    table: "charter_signatures",
    select: "user_id, display_name, state, signed_at",
    filter: (q) => q.eq("role", "leader").eq("charter_version", CHARTER_VERSION).is("verified_at", null),
    order: "signed_at",
    row: (r) => ({ id: r.user_id, title: r.display_name, meta: r.state, at: r.signed_at }),
  },
  {
    key: "mediators",
    title: { ar: "أجاويد ينتظرون التوثيق", en: "Mediators awaiting verification" },
    what: { ar: "يوثَّقون من صفحة الجودية.", en: "Verified on the judiyya page." },
    href: "/nafir/judiyya",
    table: "judiyya_mediators",
    select: "user_id, display_name, state, created_at",
    filter: (q) => q.is("verified_at", null),
    order: "created_at",
    row: (r) => ({ id: r.user_id, title: r.display_name, meta: r.state, at: r.created_at }),
  },
  {
    key: "shura",
    title: { ar: "أسئلة شورى بلا جواب", en: "Unanswered shura questions" },
    what: { ar: "يجيب عنها المشرف أو قائدٌ موثَّق.", en: "Answered by an admin or a verified leader." },
    href: "/nafir/shura",
    table: "shura_items",
    select: "id, title, created_at",
    filter: (q) => q.is("answer", null),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.title, meta: null, at: r.created_at }),
  },
  {
    key: "agreements",
    title: { ar: "عقود شراكة لم يوقّعها الطرفان بعد", en: "Partnership agreements not yet signed by both" },
    what: {
      ar: "للاطّلاع: يكتبها المستثمر وصاحب الأرض ويوقّعانها، والإدارة تتابع.",
      en: "For information: the investor and the landowner write and sign them; the administrators follow up.",
    },
    href: "/admin/inbox#agreements",
    info: true,
    table: "partnership_agreements",
    select: "id, model, version, updated_at",
    filter: (q) => q.eq("status", "draft"),
    order: "updated_at",
    row: (r) => ({ id: r.id, title: `${r.model} — v${r.version}`, meta: null, at: r.updated_at }),
  },
  {
    // A figure the daily price run could not publish on its own (backlog 131).
    key: "prices",
    title: { ar: "أسعارٌ محجوزة للمراجعة", en: "Prices held for review" },
    what: {
      ar: "قرأتها المنصّة من مصدرها، لكنّها شذّت عن آخر سعرٍ أو جاءت من نصٍّ حرّ: انشرها أو ارفضها.",
      en: "Read from their source, but off the last price or from free prose: publish or reject.",
    },
    href: "/admin/prices",
    table: "market_quotes",
    select: "id, kind, crop, market_date, created_at",
    filter: (q) => q.eq("status", "held"),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.crop || r.kind, meta: r.market_date, at: r.created_at }),
  },
  {
    // Owner agreed: the fee to record or an inspector to assign (backlog 128).
    key: "inspections",
    title: { ar: "معاينات تنتظر الأجر أو مفتّشاً", en: "Inspections waiting for the fee or an inspector" },
    what: {
      ar: "وافق صاحب الأرض: سجّل وصول الأجر إن كان، وأسندها إلى مفتّشٍ ليس طرفاً.",
      en: "The owner agreed: record the fee if there is one, and assign an inspector who is party to nothing.",
    },
    href: "/admin/inspections",
    table: "land_inspections",
    select: "id, fee_status, created_at",
    filter: (q) => q.eq("status", "accepted"),
    order: "created_at",
    row: (r) => ({ id: r.id, title: r.fee_status === "due" ? "بانتظار الأجر" : "بانتظار مفتّش", meta: null, at: r.created_at }),
  },
  {
    key: "investor_interests",
    title: { ar: "طلبات شراكة من مستثمرين", en: "Investor partnership requests" },
    what: {
      ar: "للاطّلاع: يقبلها صاحب الأرض أو يعتذر، والإدارة تتابع.",
      en: "For information: the landowner accepts or declines; the administrators follow up.",
    },
    href: "/admin/inbox#investor_interests",
    info: true,
    table: "investor_interests",
    select: "id, model, message, created_at",
    filter: (q) => q.eq("status", "pending"),
    order: "created_at",
    row: (r) => ({ id: r.id, title: String(r.message ?? "").slice(0, 80), meta: r.model, at: r.created_at }),
  },
];

/** Every queue with its count and its oldest items first — they have waited longest. */
export async function loadAdminQueue(supabase: SupabaseClient, perSection = 5): Promise<QueueSection[]> {
  return Promise.all(
    SPECS.map(async ({ table, select, filter, order, row, ...section }) => {
      const { data, count, error } = await filter(
        supabase.from(table).select(select, { count: "exact" }),
      )
        .order(order, { ascending: true })
        .limit(perSection);
      if (error) {
        console.error(`admin queue: ${table} failed`, error);
        return { ...section, count: null, items: [] };
      }
      return { ...section, count: count ?? 0, items: (data ?? []).map(row) };
    }),
  );
}

/** The header's number: what waits for an administrator's own decision. */
export async function adminPendingTotal(supabase: SupabaseClient): Promise<number> {
  const counts = await Promise.all(
    SPECS.filter((s) => !s.info).map(async ({ table, filter }) => {
      const { count, error } = await filter(supabase.from(table).select("*", { count: "exact", head: true }));
      return error ? 0 : (count ?? 0);
    }),
  );
  return counts.reduce((a, b) => a + b, 0);
}
