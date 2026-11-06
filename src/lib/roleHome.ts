/**
 * الرئيسيّة بحسب الدور (البند ٢٠٦؛ المالك، 6 نوفمبر 2026): من دخل يرى أوّلاً ما يخصّه وما ينتظره.
 *
 * This module decides, from rows already read, what the signed-in person is shown and in what order. It reads
 * nothing itself (src/lib/roleHomeLoad.ts reads, as the person, through row-level security), so every rule here is
 * held by scripts/verify-role-home.ts without a database: the website's home (src/components/RoleHome.tsx) and the
 * app's (`GET /api/app/home`) both show what `arrangeHome(buildItems(raw))` returns, and can never disagree.
 *
 * Two kinds of card:
 *   • «waiting» — something for this person to do or answer (a signature, a request, evidence a stage needs). Shown
 *     only when there is one, with its number.
 *   • «status» — where things stand (a season's next stage and its budget, the lands and their verification, the
 *     statement). Shown in the person's own groups even when there is nothing to do.
 *
 * And two kinds of group. One account is both a farmer and an investor (backlog 151); the «أرضي · استثماري» switch
 * says which side the person is on now, and that side is shown in full. A shop, a carrier or an agent company is
 * not a side one switches to — whoever holds one sees it in full too. The other side is shown compactly: only what
 * waits there, one line each.
 */

import type { Locale } from "./i18n";
import { cropName, stageName } from "./farmLabelsEn";
import { investorStatement, reversalAction, type LinkRow } from "./ledgerLinks";
import { portfolioTotals, type PortfolioRow } from "./investorTotals";

export type Bi = { ar: string; en: string };
export type HomeGroup = "admin" | "farmer" | "investor" | "supplier" | "carrier" | "agent";
export type Side = "farmer" | "investor";

export const GROUP_TITLE: Record<HomeGroup, Bi> = {
  admin: { ar: "الإدارة", en: "Administration" },
  farmer: { ar: "أرضي ومواسمي", en: "My land and seasons" },
  investor: { ar: "استثماري", en: "My investing" },
  supplier: { ar: "متجري", en: "My shop" },
  carrier: { ar: "النقل", en: "My deliveries" },
  agent: { ar: "جهتي: وضع الوكيل", en: "My organisation: agent mode" },
};

export interface HomeItem {
  key: string;
  group: HomeGroup;
  kind: "waiting" | "status";
  /** null: a card with no number to show (the administrators' second factor). */
  count: number | null;
  title: Bi;
  detail: Bi | null;
  href: string;
}

// ── What the loader hands over ───────────────────────────────────────────────

export interface RawStage {
  id: string;
  stage_key: string;
  stage_order: number;
  planned_start: string | null;
  budget: number | string | null;
  completed: boolean;
}
export interface RawSeason {
  id: string;
  name: string;
  crop_key: string;
  stages: RawStage[];
}
export interface RawAgreement {
  id: string;
  model: string;
  status: "draft" | "signed";
  version: number;
  owner_id: string;
  investor_id: string;
  manager_company_id: string | null;
}

export interface HomeRaw {
  userId: string;
  role: string | null;
  /** The profile's name, for the greeting. */
  name: string;
  /** Khartoum's day, ISO. */
  today: string;
  // The farmer's side.
  lands: { id: string; name: string; verification: string }[];
  /** Own seasons that are running, each with its stages. */
  seasons: RawSeason[];
  /** Dollars spent (revenue left out) on each stage read, by stage id. */
  spentByStage: Record<string, number>;
  /** Pieces of evidence on each stage read, by stage id. */
  evidenceByStage: Record<string, number>;
  /** Rows kept on credit and not yet settled, by season id. */
  openCreditBySeason: Record<string, number>;
  landRequests: number;
  companyRequests: number;
  agentRequests: number;
  firedAlerts: number;
  fieldAlerts: { title: string; link: string | null }[];
  fieldAlertCount: number;
  deliveriesToMe: number;
  // The investor's side.
  interests: { status: string; model: string; state: string }[];
  openLands: { mine: boolean; interest_status: string | null; models: string[]; state: string }[];
  agreements: RawAgreement[];
  signatures: { agreement_id: string; version: number; role: string }[];
  inspections: { id: string; role: string; status: string; reported_at: string | null }[];
  links: LinkRow[];
  investments: PortfolioRow[];
  // What else the person holds.
  companyIds: string[];
  supplier: { id: string; name: string; verified: boolean } | null;
  supplierOrders: { id: string; status: string }[];
  carrier: { id: string; name: string; verified: boolean } | null;
  carrierDeliveries: number;
  company: { id: string; name: string; ready: boolean } | null;
  agentFarmers: { status: string }[];
  agentObjections: number;
  admin: { total: number | null; secondFactor: boolean } | null;
}

/** An account with nothing yet: what a loader starts from, and what a test changes one field of. */
export function emptyRaw(userId: string, role: string | null, today: string): HomeRaw {
  return {
    userId,
    role,
    name: "",
    today,
    lands: [],
    seasons: [],
    spentByStage: {},
    evidenceByStage: {},
    openCreditBySeason: {},
    landRequests: 0,
    companyRequests: 0,
    agentRequests: 0,
    firedAlerts: 0,
    fieldAlerts: [],
    fieldAlertCount: 0,
    deliveriesToMe: 0,
    interests: [],
    openLands: [],
    agreements: [],
    signatures: [],
    inspections: [],
    links: [],
    investments: [],
    companyIds: [],
    supplier: null,
    supplierOrders: [],
    carrier: null,
    carrierDeliveries: 0,
    company: null,
    agentFarmers: [],
    agentObjections: 0,
    admin: null,
  };
}

// ── Small helpers ────────────────────────────────────────────────────────────

/** The side of the one account the person is on now: `profiles.role`, which the switch moves (backlog 151). */
export const sideOf = (role: string | null): Side => (role === "investor" ? "investor" : "farmer");

const num = (v: number, l: Locale) => v.toLocaleString(l === "en" ? "en-US" : "ar-EG");
const usd = (v: number, l: Locale) =>
  new Intl.NumberFormat(l === "en" ? "en-US" : "ar", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const bi = (f: (l: Locale) => string): Bi => ({ ar: f("ar"), en: f("en") });
const same = (s: string): Bi => ({ ar: s, en: s });
/** «و» between parts in Arabic, a middle dot in both, so a list reads in either language. */
const parts = (xs: (Bi | null)[]): Bi | null => {
  const kept = xs.filter((x): x is Bi => x !== null);
  return kept.length ? { ar: kept.map((x) => x.ar).join(" · "), en: kept.map((x) => x.en).join(" · ") } : null;
};

/** The first open stage, in plan order: the one the farmer can act on (as stageReminders reads it). */
export function nextOpenStage<T extends Pick<RawStage, "stage_order" | "completed">>(stages: T[]): T | null {
  return [...stages].sort((a, b) => a.stage_order - b.stage_order).find((s) => !s.completed) ?? null;
}

/**
 * The stages that wait for evidence: in each running season, the next open stage once its planned start has come,
 * with nothing uploaded on it yet. The database signs no stage off without evidence, and only the next open one can
 * be signed off, so this is exactly the stage the farmer cannot close today.
 */
export function stagesWaitingForEvidence(raw: Pick<HomeRaw, "seasons" | "evidenceByStage" | "today">) {
  const out: { season: RawSeason; stage: RawStage }[] = [];
  for (const season of raw.seasons) {
    const stage = nextOpenStage(season.stages);
    if (!stage || !stage.planned_start || stage.planned_start > raw.today) continue;
    if ((raw.evidenceByStage[stage.id] ?? 0) > 0) continue;
    out.push({ season, stage });
  }
  return out;
}

/** The agreement's current version, not yet signed by the role this person holds in it. */
export function agreementsToSign(raw: Pick<HomeRaw, "userId" | "agreements" | "signatures" | "companyIds">) {
  const companies = new Set(raw.companyIds);
  const out: { agreement: RawAgreement; me: "owner" | "investor" | "manager" }[] = [];
  for (const a of raw.agreements) {
    if (a.status !== "draft") continue;
    const me =
      a.owner_id === raw.userId
        ? "owner"
        : a.investor_id === raw.userId
          ? "investor"
          : a.manager_company_id && companies.has(a.manager_company_id)
            ? "manager"
            : null;
    if (!me) continue;
    // A managing company signs only the three-party agreement.
    if (me === "manager" && a.model !== "managed") continue;
    const signed = raw.signatures.some((s) => s.agreement_id === a.id && s.version === a.version && s.role === me);
    if (!signed) out.push({ agreement: a, me });
  }
  return out;
}

/** Which of the person's groups an agreement belongs to. */
function groupOfAgreement(raw: Pick<HomeRaw, "userId" | "agreements">, id: string, fallback: Side): Side {
  const a = raw.agreements.find((x) => x.id === id);
  if (!a) return fallback;
  return a.investor_id === raw.userId ? "investor" : a.owner_id === raw.userId ? "farmer" : fallback;
}

/** What the person holds, whether or not anything waits there now. */
export function holdings(raw: HomeRaw): Set<HomeGroup> {
  const held = new Set<HomeGroup>();
  if (raw.role === "admin") held.add("admin");
  if (raw.lands.length > 0 || raw.seasons.length > 0) held.add("farmer");
  if (
    raw.interests.length > 0 ||
    raw.investments.length > 0 ||
    raw.agreements.some((a) => a.investor_id === raw.userId)
  ) {
    held.add("investor");
  }
  if (raw.supplier) held.add("supplier");
  if (raw.carrier) held.add("carrier");
  if (raw.company) held.add("agent");
  return held;
}

// ── The cards ────────────────────────────────────────────────────────────────

/** At most this many seasons get a card of their own; the rest are counted in one. */
export const MAX_SEASON_CARDS = 3;
/** A price alert that fired within this many days still counts as news. */
export const FIRED_ALERT_DAYS = 14;
/** A field alert or an objection older than this has had its moment. */
export const RECENT_DAYS = 30;

export function buildItems(raw: HomeRaw): HomeItem[] {
  const items: HomeItem[] = [];
  const side = sideOf(raw.role);
  const push = (i: HomeItem) => items.push(i);

  // ── المزارع وصاحب الأرض ──
  for (const season of raw.seasons.slice(0, MAX_SEASON_CARDS)) {
    const next = nextOpenStage(season.stages);
    let detail: Bi;
    if (next) {
      const budget = Number(next.budget ?? 0);
      const spent = raw.spentByStage[next.id] ?? 0;
      const pct = budget > 0 ? Math.round((spent / budget) * 100) : null;
      detail = bi((l) => {
        const stage = l === "en" ? `Next stage: ${stageName(next.stage_key, l)}` : `المرحلة التالية: ${stageName(next.stage_key, l)}`;
        if (pct === null) return `${stage}${l === "en" ? " — no planned budget" : " — بلا ميزانيّةٍ مخطّطة"}`;
        const use =
          l === "en"
            ? ` — ${num(pct, l)}% of its budget spent (${usd(spent, l)} of ${usd(budget, l)})`
            : ` — صُرف ${num(pct, l)}٪ من ميزانيّتها (${usd(spent, l)} من ${usd(budget, l)})`;
        return stage + use;
      });
    } else {
      detail = {
        ar: "كلّ المراحل معتمدة — سجّل الحصاد وأقفل الموسم",
        en: "Every stage is signed off — record the harvest and close the season",
      };
    }
    push({
      key: `season:${season.id}`,
      group: "farmer",
      kind: "status",
      count: null,
      title: bi((l) => `${season.name} · ${cropName(season.crop_key, l)}`),
      detail,
      href: `/seasons/${season.id}`,
    });
  }
  if (raw.seasons.length > MAX_SEASON_CARDS) {
    const more = raw.seasons.length - MAX_SEASON_CARDS;
    push({
      key: "seasons:more",
      group: "farmer",
      kind: "status",
      count: more,
      title: bi((l) => (l === "en" ? `${num(more, l)} more running season(s)` : `و${num(more, l)} مواسم جارية أخرى`)),
      detail: null,
      href: "/seasons",
    });
  }

  const evidence = stagesWaitingForEvidence(raw);
  if (evidence.length > 0) {
    const first = evidence[0];
    push({
      key: "evidence",
      group: "farmer",
      kind: "waiting",
      count: evidence.length,
      title: { ar: "مراحل تنتظر أدلّتها", en: "Stages waiting for their evidence" },
      detail: bi((l) =>
        l === "en"
          ? `“${stageName(first.stage.stage_key, l)}” in “${first.season.name}”: upload a photo or an invoice, then sign it off`
          : `«${stageName(first.stage.stage_key, l)}» في «${first.season.name}»: ارفع صورةً أو فاتورة ثمّ اعتمدها`,
      ),
      href: `/seasons/${first.season.id}`,
    });
  }

  const creditSeasons = Object.entries(raw.openCreditBySeason).filter(([, n]) => n > 0);
  const credit = creditSeasons.reduce((a, [, n]) => a + n, 0);
  if (credit > 0) {
    push({
      key: "credit",
      group: "farmer",
      kind: "waiting",
      count: credit,
      title: { ar: "قيودٌ على الآجل لم تُسدَّد", en: "Credit entries not yet settled" },
      detail: { ar: "سدّدها من صفحة الموسم يوم تدفع", en: "Settle them from the season's page on the day you pay" },
      href: `/seasons/${creditSeasons[0][0]}`,
    });
  }

  if (raw.lands.length > 0) {
    const by = (v: string) => raw.lands.filter((l) => l.verification === v).length;
    const [verified, submitted, unverified, rejected] = [by("verified"), by("submitted"), by("unverified"), by("rejected")];
    push({
      key: "lands",
      group: "farmer",
      kind: "status",
      count: raw.lands.length,
      title: { ar: "أراضيّ", en: "My land" },
      detail: parts([
        verified ? bi((l) => (l === "en" ? `${num(verified, l)} verified` : `${num(verified, l)} موثّقة`)) : null,
        submitted ? bi((l) => (l === "en" ? `${num(submitted, l)} under review` : `${num(submitted, l)} قيد المراجعة`)) : null,
        unverified ? bi((l) => (l === "en" ? `${num(unverified, l)} waiting for papers` : `${num(unverified, l)} تنتظر مستنداتها`)) : null,
        rejected ? bi((l) => (l === "en" ? `${num(rejected, l)} to correct` : `${num(rejected, l)} تحتاج تصحيحاً`)) : null,
      ]),
      href: "/lands",
    });
  }

  const asked = raw.inspections.filter((i) => i.role === "owner" && i.status === "requested").length;
  const onLand = raw.landRequests + raw.companyRequests + asked;
  if (onLand > 0) {
    push({
      key: "land-requests",
      group: "farmer",
      kind: "waiting",
      count: onLand,
      title: { ar: "طلباتٌ على أرضك تنتظر ردّك", en: "Requests on your land waiting for your answer" },
      detail: parts([
        raw.landRequests ? bi((l) => (l === "en" ? `${num(raw.landRequests, l)} from investors` : `${num(raw.landRequests, l)} من مستثمرين`)) : null,
        raw.companyRequests ? bi((l) => (l === "en" ? `${num(raw.companyRequests, l)} from companies` : `${num(raw.companyRequests, l)} من شركات`)) : null,
        asked ? bi((l) => (l === "en" ? `${num(asked, l)} inspection(s) to allow` : `${num(asked, l)} معاينة تنتظر موافقتك`)) : null,
      ]),
      href: "/lands",
    });
  }

  if (raw.agentRequests > 0) {
    push({
      key: "agent-requests",
      group: "farmer",
      kind: "waiting",
      count: raw.agentRequests,
      title: { ar: "جهةٌ تطلب أن تعمل عنك", en: "An organisation asks to act for you" },
      detail: { ar: "اقرأ سببها، ثمّ اقبل أو اعتذر", en: "Read their reason, then accept or decline" },
      href: "/account/agents",
    });
  }

  const toSign = agreementsToSign(raw);
  const signCard = (me: "owner" | "investor" | "manager", group: HomeGroup) => {
    const mine = toSign.filter((x) => x.me === me);
    if (mine.length === 0) return;
    push({
      key: `sign:${me}`,
      group,
      kind: "waiting",
      count: mine.length,
      title: { ar: "عقودٌ تنتظر توقيعك", en: "Agreements waiting for your signature" },
      detail: mine[0].agreement.version > 1
        ? { ar: "نسخةٌ جديدة من الشروط: اقرأها ووقّعها", en: "A new version of the terms: read it and sign" }
        : { ar: "اقرأ البنود ثمّ وقّع", en: "Read the clauses, then sign" },
      href: `/invest/agreements/${mine[0].agreement.id}`,
    });
  };
  signCard("owner", "farmer");

  // Proposals the partner booked in both books, waiting for this person's answer (as /books counts them).
  const linksWaiting = raw.links.filter((l) => (l.status === "pending" && !l.mine) || reversalAction(l) === "answer");
  for (const g of ["farmer", "investor"] as const) {
    const n = linksWaiting.filter((l) => groupOfAgreement(raw, l.agreement_id, side) === g).length;
    if (n === 0) continue;
    push({
      key: `links:${g}`,
      group: g,
      kind: "waiting",
      count: n,
      title: { ar: "قيودٌ اقترحها شريكك تنتظر تأكيدك", en: "Entries your partner proposed, waiting for you" },
      detail: { ar: "أكّدها أو اعترض عليها في دفترك", en: "Confirm or object to them in your books" },
      href: "/books?report=links",
    });
  }

  if (raw.firedAlerts > 0) {
    push({
      key: "price-alerts",
      group: "farmer",
      kind: "waiting",
      count: raw.firedAlerts,
      title: { ar: "تنبيهات أسعارٍ انطلقت", en: "Price alerts that fired" },
      detail: bi((l) => (l === "en" ? `In the last ${num(FIRED_ALERT_DAYS, l)} days` : `في آخر ${num(FIRED_ALERT_DAYS, l)} يوماً`)),
      href: "/market/alerts",
    });
  }

  if (raw.fieldAlertCount > 0) {
    const first = raw.fieldAlerts[0];
    push({
      key: "field-alerts",
      group: "farmer",
      kind: "waiting",
      count: raw.fieldAlertCount,
      title: { ar: "جرادٌ أو مرضُ ماشيةٍ قرب أرضك", en: "Locusts or livestock disease near your land" },
      // The notification's own words, as the daily job wrote them (in Arabic).
      detail: first ? same(first.title) : null,
      href: first?.link && first.link.startsWith("/") ? first.link : "/notifications",
    });
  }

  if (raw.deliveriesToMe > 0) {
    push({
      key: "deliveries-to-me",
      group: "farmer",
      kind: "waiting",
      count: raw.deliveriesToMe,
      title: { ar: "توصيلٌ إلى أرضك ينتظر رمز استلامك", en: "A delivery to your farm waiting for your code" },
      detail: { ar: "أعطِ الرمز للسائق بعد أن ترى بضاعتك", en: "Give the driver the code once you have seen the goods" },
      href: "/suppliers/deliveries",
    });
  }

  if (raw.lands.length === 0 && raw.seasons.length === 0) {
    push({
      key: "farmer:start",
      group: "farmer",
      kind: "status",
      count: null,
      title: { ar: "سجّل أرضك ووثّق موسمك", en: "Register your land and record your season" },
      detail: { ar: "أرضٌ موثّقة أساسُ كلّ موسمٍ وكلّ شراكة", en: "Verified land is the basis of every season and every partnership" },
      href: "/lands/new",
    });
  }

  // ── المستثمر ──
  const myModels = new Set(raw.interests.map((i) => i.model));
  const myStates = new Set(raw.interests.map((i) => i.state));
  const fresh = raw.openLands.filter((o) => !o.mine && !o.interest_status);
  const matching = fresh.filter((o) => o.models.some((m) => myModels.has(m)) || myStates.has(o.state)).length;
  push({
    key: "opportunities",
    group: "investor",
    kind: "status",
    count: fresh.length,
    title: fresh.length
      ? { ar: "أراضٍ موثّقة تبحث عن شريك", en: "Verified land looking for a partner" }
      : { ar: "لا أرضَ جديدة معروضة الآن", en: "No new land on offer right now" },
    detail:
      fresh.length && matching && raw.interests.length
        ? bi((l) =>
            l === "en"
              ? `${num(matching, l)} like what you asked for before (the model or the state)`
              : `منها ${num(matching, l)} تشبه ما طلبته من قبل (النموذج أو الولاية)`,
          )
        : { ar: "تصفّحها: لا اسم ولا موقع حتى يقبل صاحبها", en: "Browse them: no name or place until the owner accepts" },
    href: "/invest",
  });

  if (raw.interests.length > 0) {
    const pending = raw.interests.filter((i) => i.status === "pending").length;
    const accepted = raw.interests.filter((i) => i.status === "accepted").length;
    push({
      key: "my-requests",
      group: "investor",
      kind: "status",
      count: pending + accepted,
      title: { ar: "طلباتي", en: "My requests" },
      detail:
        parts([
          pending ? bi((l) => (l === "en" ? `${num(pending, l)} waiting for the owner` : `${num(pending, l)} بانتظار صاحب الأرض`)) : null,
          accepted ? bi((l) => (l === "en" ? `${num(accepted, l)} accepted` : `${num(accepted, l)} قُبلت`)) : null,
        ]) ?? { ar: "لا طلب مفتوحاً", en: "No open request" },
      href: "/invest/mine",
    });
  }

  signCard("investor", "investor");

  const reports = raw.inspections
    .filter((i) => i.role === "investor" && i.status === "reported")
    .sort((a, b) => (b.reported_at ?? "").localeCompare(a.reported_at ?? ""));
  if (reports.length > 0) {
    push({
      key: "inspection-reports",
      group: "investor",
      kind: "status",
      count: reports.length,
      title: { ar: "تقارير المعاينة", en: "Inspection reports" },
      detail: { ar: "ما وجده المفتّش في الأرض، بصوره", en: "What the inspector found on the land, with photos" },
      href: `/invest/inspections/${reports[0].id}`,
    });
  }

  // The statement over the agreements where this person is the investor: confirmed entries only, as the agreement page.
  const asInvestor = new Set(raw.agreements.filter((a) => a.investor_id === raw.userId).map((a) => a.id));
  const myLinks = raw.links.filter((l) => asInvestor.has(l.agreement_id));
  if (myLinks.some((l) => l.status === "confirmed")) {
    const st = investorStatement(myLinks);
    const d = (v: bigint) => Number(v) / 100;
    push({
      key: "statement",
      group: "investor",
      kind: "status",
      count: null,
      title: { ar: "كشف حسابك مع شركائك", en: "Your statement with your partners" },
      detail: bi((l) =>
        l === "en"
          ? `Financed ${usd(d(st.invested), l)} · handed to you ${usd(d(st.handedOver), l)} · still due ${usd(d(st.due > BigInt(0) ? st.due : BigInt(0)), l)}`
          : `موّلتَ ${usd(d(st.invested), l)} · سُلّم لك ${usd(d(st.handedOver), l)} · متبقٍّ لك ${usd(d(st.due > BigInt(0) ? st.due : BigInt(0)), l)}`,
      ),
      href: asInvestor.size === 1 ? `/invest/agreements/${[...asInvestor][0]}` : "/invest/mine",
    });
  }

  if (raw.investments.length > 0) {
    const t = portfolioTotals(raw.investments);
    push({
      key: "portfolio",
      group: "investor",
      kind: "status",
      count: null,
      title: { ar: "محفظتي في المشاريع", en: "My project portfolio" },
      detail: parts([
        bi((l) => (l === "en" ? `${usd(t.invested, l)} confirmed in ${num(t.projects, l)} project(s)` : `${usd(t.invested, l)} مؤكَّدة في ${num(t.projects, l)} مشروع`)),
        t.pendingCount ? bi((l) => (l === "en" ? `${num(t.pendingCount, l)} awaiting confirmation` : `${num(t.pendingCount, l)} بانتظار التأكيد`)) : null,
      ]),
      href: "/dashboard",
    });
  }

  // ── المورّد والناقل ──
  if (raw.supplier) {
    if (!raw.supplier.verified) {
      push({
        key: "supplier:verify",
        group: "supplier",
        kind: "status",
        count: null,
        title: same(raw.supplier.name),
        detail: { ar: "بانتظار توثيق الإدارة", en: "Awaiting the administrators' verification" },
        href: "/suppliers/mine",
      });
    }
    const open = raw.supplierOrders.filter((o) => o.status === "open").length;
    const closed = raw.supplierOrders.filter((o) => o.status === "closed").length;
    const live = raw.supplierOrders.filter((o) => o.status === "open" || o.status === "closed");
    if (live.length > 0) {
      push({
        key: "supplier:orders",
        group: "supplier",
        kind: "waiting",
        count: live.length,
        title: { ar: "طلباتٌ جماعيّة على متجرك", en: "Group orders with your shop" },
        detail: parts([
          open ? bi((l) => (l === "en" ? `${num(open, l)} open to join` : `${num(open, l)} مفتوحة للانضمام`)) : null,
          closed ? bi((l) => (l === "en" ? `${num(closed, l)} closed, waiting to be delivered` : `${num(closed, l)} أُغلقت وتنتظر التسليم`)) : null,
        ]),
        href: live.length === 1 ? `/suppliers/orders/${live[0].id}` : "/suppliers/orders",
      });
    }
  }
  if (raw.carrier) {
    if (!raw.carrier.verified) {
      push({
        key: "carrier:verify",
        group: "carrier",
        kind: "status",
        count: null,
        title: same(raw.carrier.name),
        detail: { ar: "بانتظار توثيق الإدارة", en: "Awaiting the administrators' verification" },
        href: "/suppliers/deliveries",
      });
    }
    if (raw.carrierDeliveries > 0) {
      push({
        key: "carrier:deliveries",
        group: "carrier",
        kind: "waiting",
        count: raw.carrierDeliveries,
        title: { ar: "توصيلاتٌ تنتظر التسليم", en: "Deliveries waiting to be handed over" },
        detail: { ar: "صورةٌ وموقعٌ ورمز المستلم عند التسليم", en: "A photo, the location and the recipient's code at handover" },
        href: "/suppliers/deliveries",
      });
    }
  }

  // ── شركة الوكيل ──
  if (raw.company) {
    if (!raw.company.ready) {
      push({
        key: "agent:verify",
        group: "agent",
        kind: "status",
        count: null,
        title: same(raw.company.name),
        detail: { ar: "يُفتح وضع الوكيل حين توثّقها الإدارة", en: "Agent mode opens once the administrators verify it" },
        href: "/partners/mine",
      });
    } else {
      const active = raw.agentFarmers.filter((m) => m.status === "active").length;
      const pending = raw.agentFarmers.filter((m) => m.status === "pending").length;
      push({
        key: "agent:farmers",
        group: "agent",
        kind: "status",
        count: active,
        title: { ar: "مزارعوك", en: "Your farmers" },
        detail: bi((l) =>
          l === "en" ? `${num(active, l)} with a permission in force` : `${num(active, l)} بإذنٍ نافذ`,
        ),
        href: "/agent",
      });
      if (pending > 0) {
        push({
          key: "agent:mandates",
          group: "agent",
          kind: "waiting",
          count: pending,
          title: { ar: "طلبات إذنٍ لم يُجب عنها بعد", en: "Permission requests not yet answered" },
          detail: { ar: "ينتظر كلٌّ منها قبول المزارع من حسابه", en: "Each waits for the farmer to accept from their own account" },
          href: "/agent",
        });
      }
    }
    if (raw.agentObjections > 0) {
      push({
        key: "agent:objections",
        group: "agent",
        kind: "waiting",
        count: raw.agentObjections,
        title: { ar: "اعتراضاتٌ على ما كتبتَه عن مزارعيك", en: "Objections to what you wrote for your farmers" },
        detail: bi((l) => (l === "en" ? `In the last ${num(RECENT_DAYS, l)} days` : `في آخر ${num(RECENT_DAYS, l)} يوماً`)),
        href: "/agent",
      });
    }
    signCard("manager", "agent");
  }

  // ── المدير ──
  if (raw.admin) {
    if (raw.admin.secondFactor) {
      push({
        key: "admin:second-factor",
        group: "admin",
        kind: "waiting",
        count: null,
        title: { ar: "قائمة المراجعة تحتاج الرمز الثاني", en: "The review list needs your second factor" },
        detail: {
          ar: "افتح الإدارة في الموقع وادخل بالرمز من تطبيق المصادقة.",
          en: "Open the administration on the website and enter the code from your authenticator app.",
        },
        href: "/admin",
      });
    } else {
      const total = raw.admin.total ?? 0;
      push({
        key: "admin:queue",
        group: "admin",
        kind: total > 0 ? "waiting" : "status",
        count: total,
        title: total > 0
          ? { ar: "تنتظر قرار الإدارة", en: "Waiting for the administrators' decision" }
          : { ar: "لا شيء ينتظر الإدارة الآن", en: "Nothing waits for the administrators now" },
        detail: { ar: "قائمة المراجعة: الأراضي والجهات والعروض والمعاينات", en: "The review list: land, organisations, offers and inspections" },
        href: "/admin/inbox",
      });
    }
  }

  return items;
}

// ── Order ────────────────────────────────────────────────────────────────────

export interface HomeSection {
  group: HomeGroup;
  title: Bi;
  items: HomeItem[];
}

export interface HomeView {
  role: string | null;
  name: string;
  side: Side;
  /** Shown in full, in this order. */
  full: HomeSection[];
  /** The person's other groups: only what waits there. */
  compact: HomeSection[];
  /** Everything that waits, in both. */
  waiting: number;
}

const shown = (i: HomeItem) => i.kind === "status" || i.count === null || i.count > 0;
const waits = (i: HomeItem) => i.kind === "waiting" && (i.count === null || i.count > 0);

export function arrangeHome(role: string | null, items: HomeItem[], held: Set<HomeGroup>, name = ""): HomeView {
  const side = sideOf(role);
  const order: HomeGroup[] = [];
  if (role === "admin") {
    order.push("admin");
    // An administrator has no side of his own: the one he holds, if any, is his.
    if (held.has("farmer")) order.push("farmer");
    else if (held.has("investor")) order.push("investor");
  } else {
    order.push(side);
  }
  for (const g of ["supplier", "carrier", "agent"] as const) if (held.has(g)) order.push(g);

  const section = (group: HomeGroup, filter: (i: HomeItem) => boolean): HomeSection => {
    const mine = items.filter((i) => i.group === group && filter(i));
    // What waits comes first; within each kind the order the cards were built in.
    return { group, title: GROUP_TITLE[group], items: [...mine.filter(waits), ...mine.filter((i) => !waits(i))] };
  };

  const full = order.map((g) => section(g, shown));
  const rest: HomeGroup[] = (["admin", "farmer", "investor", "supplier", "carrier", "agent"] as const).filter(
    (g) => !order.includes(g),
  );
  const compact = rest.map((g) => section(g, waits)).filter((s) => s.items.length > 0);
  const waiting = [...full, ...compact].flatMap((s) => s.items).filter(waits).reduce((a, i) => a + (i.count ?? 1), 0);
  return { role, name, side, full, compact, waiting };
}

/** The whole decision, from the rows to what is shown. */
export const roleHome = (raw: HomeRaw): HomeView => arrangeHome(raw.role, buildItems(raw), holdings(raw), raw.name);

/** One language, for the app (which reads Arabic) and for anything that wants plain strings. */
export function localizeHome(view: HomeView, locale: Locale) {
  const one = (b: Bi | null) => (b ? b[locale] : null);
  const sec = (s: HomeSection) => ({
    group: s.group,
    title: s.title[locale],
    items: s.items.map((i) => ({
      key: i.key,
      kind: i.kind,
      count: i.count,
      title: i.title[locale],
      detail: one(i.detail),
      href: i.href,
    })),
  });
  return { role: view.role, name: view.name, side: view.side, waiting: view.waiting, full: view.full.map(sec), compact: view.compact.map(sec) };
}
