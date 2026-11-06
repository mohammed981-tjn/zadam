/**
 * ما تقرؤه صفحات القيد والمراجعة والسجلّ والاستثناءات والإقفال (البند ٢٠٥) — للموقع والتطبيق معاً.
 *
 * Every read is the reader's own (row-level security decides what he sees): the owner reads his books, their drafts,
 * audit log, exceptions and closings; a preparer reads his invitations, his own drafts and — through
 * ledger_preparer_chart — the chart of a book he prepares for, and nothing else of it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { tr, type Locale } from "@/lib/i18n";
import { bookChart } from "./journalWrites";
import type { ChartAccount, EntryTemplate } from "./journal";

export interface WritableBook {
  id: string;
  kind: "farm" | "investor" | "platform";
  role: "owner" | "preparer";
  owner_name: string;
  closed_through: string | null;
  always_review: boolean;
}

export interface DraftRow {
  id: string;
  book_id: string;
  prepared_by: string;
  preparer_ref: string | null;
  via: string;
  kind: string;
  template_key: string | null;
  entry_date: string;
  memo: string;
  lines: DraftLine[];
  rate: number | null;
  document_path: string | null;
  status: "pending" | "posted" | "rejected" | "withdrawn";
  decision_note: string | null;
  decided_at: string | null;
  entry_id: string | null;
  created_at: string;
  /** What the posting function worked out when the draft was checked (20261106100000); null for an older draft. */
  checked: DraftChecked | null;
}

/** A line as the preparer sent it: whatever else he put on it (tags, a memo) is part of what the owner approves. */
export interface DraftLine {
  account?: string;
  key?: string;
  side: "D" | "C";
  currency: string;
  minor: number;
  season?: string | null;
  land?: string | null;
  herd?: string | null;
  project?: string | null;
  memo?: string | null;
}

export interface DraftChecked {
  rate: number | string | null;
  fx_source: string | null;
  base_currency: string;
  lines: {
    line: number;
    account: string;
    side: "D" | "C";
    currency: string;
    minor: number;
    base: number;
    season: string | null;
    land: string | null;
    herd: string | null;
    project: string | null;
    memo: string | null;
  }[];
}

/** The names of what a line may be tagged with, by id, as the owner reads them. */
export type TagNames = Map<string, string>;

/** One line of a draft as the approver must see it: the account, the amount, its worth in the book's currency, tags, memo. */
export interface DraftLineFacts {
  account: string;
  side: "D" | "C";
  currency: string;
  minor: number;
  /** In the book's currency, as it will post; null when the draft was never checked (written before 20261106100000). */
  base: number | null;
  baseCurrency: string;
  tags: string[];
  memo: string | null;
}

export interface DraftFacts {
  lines: DraftLineFacts[];
  /** The rate of a pound entry and where it came from (typed by the preparer, or the market's), or null. */
  rate: { value: string; source: string | null } | null;
  /** The preparer's permission (or the agent's mandate) has ended since: the owner should know before approving. */
  permissionEnded: boolean;
}

const TAG_LABEL: Record<string, { ar: string; en: string }> = {
  season: { ar: "موسم", en: "season" },
  land: { ar: "أرض", en: "land" },
  herd: { ar: "قطيع", en: "herd" },
  project: { ar: "مشروع", en: "project" },
};

/**
 * What the review shows of a draft before it is approved (backlog 209, S4): every line with its worth in the book's
 * currency as the posting function computed it, the tags and memo on it, the rate a pound entry carries and who set it,
 * and whether the permission it was prepared under has ended. The web page and the app's route both read this.
 */
export function draftFacts(
  d: DraftRow,
  accountName: (code?: string, key?: string) => string,
  tagNames: TagNames,
  preparer: PreparerRow | undefined,
  locale: Locale,
): DraftFacts {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const checkedLines = d.checked?.lines ?? [];
  const tagsOf = (o: { season?: string | null; land?: string | null; herd?: string | null; project?: string | null }) =>
    (["season", "land", "herd", "project"] as const)
      .filter((k) => !!o[k])
      .map((k) => `${t(TAG_LABEL[k].ar, TAG_LABEL[k].en)}: ${tagNames.get(o[k] as string) ?? (o[k] as string).slice(0, 8)}`);
  const lines: DraftLineFacts[] = d.lines.map((l, i) => {
    const c = checkedLines.find((x) => x.line === i + 1);
    return {
      account: accountName(l.account ?? c?.account, l.key),
      side: l.side,
      currency: l.currency,
      minor: Number(l.minor),
      base: c ? Number(c.base) : null,
      baseCurrency: d.checked?.base_currency ?? "USD",
      tags: tagsOf(l),
      memo: (l.memo ?? "").trim() || null,
    };
  });
  // A rounding line the posting function adds (a pound entry a cent off) is shown as it will post.
  for (const c of checkedLines.filter((x) => x.line > d.lines.length)) {
    lines.push({
      account: accountName(c.account),
      side: c.side,
      currency: c.currency,
      minor: Number(c.minor),
      base: Number(c.base),
      baseCurrency: d.checked?.base_currency ?? "USD",
      tags: [],
      memo: c.memo,
    });
  }
  const rateValue = d.checked?.rate ?? d.rate;
  const source = d.checked?.fx_source ?? (d.rate !== null ? "user" : null);
  return {
    lines,
    rate:
      rateValue === null || rateValue === undefined
        ? null
        : {
            value: String(rateValue),
            source:
              source === "user"
                ? t("كتبه مُعِدّ القيد", "typed by the preparer")
                : source === "parallel"
                  ? t("سعر السوق الموازية المنشور", "the published parallel-market rate")
                  : source === "bank"
                    ? t("سعر البنك المنشور", "the published bank rate")
                    : null,
          },
    permissionEnded: !!preparer && (preparer.status !== "active" || !preparer.standing),
  };
}

/** The names of the seasons, lands, herds and projects the drafts' lines are tagged with, as the reader can read them. */
export async function loadTagNames(supabase: SupabaseClient, drafts: DraftRow[]): Promise<TagNames> {
  const ids = (k: "season" | "land" | "herd" | "project") => [
    ...new Set(drafts.flatMap((d) => d.lines.map((l) => l[k]).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)))),
  ];
  const names: TagNames = new Map();
  const read = async (table: string, list: string[]) => {
    if (!list.length) return;
    const { data } = await supabase.from(table).select("id, name").in("id", list);
    for (const r of (data ?? []) as { id: string; name: string }[]) names.set(r.id, r.name);
  };
  await Promise.all([read("seasons", ids("season")), read("lands", ids("land")), read("herds", ids("herd")), read("projects", ids("project"))]);
  return names;
}

export interface PreparerRow {
  id: string;
  role: "agent" | "accountant";
  status: "invited" | "active" | "declined" | "ended";
  full_name: string | null;
  company_name: string | null;
  contact_tail: string | null;
  invited_at: string;
  answered_at: string | null;
  ended_at: string | null;
  standing: boolean;
}

export interface InvitationRow {
  id: string;
  book_id: string;
  book_kind: string;
  owner_name: string;
  role: string;
  status: "invited" | "active";
  invited_at: string;
  standing: boolean;
}

export interface AgentRow {
  id: string;
  company_name: string;
  status: string;
}

export interface AuditRow {
  id: number;
  book_id: string;
  at: string;
  actor_id: string | null;
  actor_name: string;
  via: string;
  action: string;
  entry_id: string | null;
  draft_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface ExceptionRow {
  kind: string;
  entry_id: string | null;
  entry_no: number | null;
  entry_date: string | null;
  draft_id: string | null;
  account_code: string | null;
  amount_minor: number | null;
  detail: Record<string, unknown> | null;
}

const DRAFT_COLUMNS =
  "id, book_id, prepared_by, preparer_ref, via, kind, template_key, entry_date, memo, lines, rate, document_path, status, decision_note, decided_at, entry_id, created_at, checked";

/** The books the reader writes in: his own (farm, investor), and those he prepares for with a standing permission. */
export async function writableBooks(supabase: SupabaseClient, me: string): Promise<WritableBook[]> {
  const [{ data: own }, { data: mine }] = await Promise.all([
    supabase.from("ledger_books").select("id, kind, closed_through").eq("owner_id", me).order("kind"),
    supabase.rpc("ledger_preparer_mine"),
  ]);
  const owned = (own ?? []) as { id: string; kind: WritableBook["kind"]; closed_through: string | null }[];
  const { data: settings } = owned.length
    ? await supabase.from("ledger_book_settings").select("book_id, always_review").in("book_id", owned.map((b) => b.id))
    : { data: [] };
  const review = new Map(((settings ?? []) as { book_id: string; always_review: boolean }[]).map((s) => [s.book_id, s.always_review]));
  const out: WritableBook[] = owned.map((b) => ({
    id: b.id,
    kind: b.kind,
    role: "owner",
    owner_name: "",
    closed_through: b.closed_through,
    always_review: review.get(b.id) ?? false,
  }));
  for (const p of (mine ?? []) as InvitationRow[]) {
    if (p.status === "active" && p.standing && !out.some((b) => b.id === p.book_id)) {
      out.push({ id: p.book_id, kind: p.book_kind as WritableBook["kind"], role: "preparer", owner_name: p.owner_name, closed_through: null, always_review: true });
    }
  }
  return out;
}

export async function loadTemplates(supabase: SupabaseClient): Promise<EntryTemplate[]> {
  const { data, error } = await supabase.from("ledger_entry_templates").select("key, book_kinds, grp, name_ar, name_en, hint_ar, hint_en, lines, sort").order("sort");
  if (error) throw new Error(`templates: ${error.message}`);
  return (data ?? []) as EntryTemplate[];
}

export async function loadChart(supabase: SupabaseClient, bookId: string): Promise<ChartAccount[]> {
  return bookChart(supabase, bookId);
}

export interface ReviewData {
  /** The reader's own books with what waits in each, who prepares for it, and its setting. */
  owned: { book: WritableBook; pending: DraftRow[]; preparers: PreparerRow[]; chart: ChartAccount[]; tagNames: TagNames }[];
  /** What the reader prepared for others' books, the latest first. */
  prepared: DraftRow[];
  invitations: InvitationRow[];
  /** The reader's agents with a standing mandate, who can be made preparers. */
  agents: AgentRow[];
  /** The books the reader prepares for with a standing permission. */
  preparing: WritableBook[];
}

/**
 * The drafts a query names, with `checked` when the database has it: a site that goes out before
 * 20261106100000 still shows what waits (without the computed amounts) rather than nothing.
 */
async function readDrafts(
  query: (columns: string) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<DraftRow[]> {
  const first = await query(DRAFT_COLUMNS);
  if (!first.error) return (first.data ?? []) as DraftRow[];
  const missing = (first.error.code === "42703" || first.error.code === "PGRST204") && (first.error.message ?? "").includes("checked");
  if (!missing) return [];
  const again = await query(DRAFT_COLUMNS.replace(", checked", ""));
  return ((again.data ?? []) as DraftRow[]).map((d) => ({ ...d, checked: null }));
}

export async function loadReview(supabase: SupabaseClient, me: string): Promise<ReviewData> {
  const books = await writableBooks(supabase, me);
  const ownBooks = books.filter((b) => b.role === "owner" && b.kind !== "platform");
  const ids = ownBooks.map((b) => b.id);
  const [pending, prepared, { data: invites }, { data: agents }] = await Promise.all([
    ids.length
      ? readDrafts((cols) => supabase.from("ledger_drafts").select(cols).in("book_id", ids).eq("status", "pending").order("created_at"))
      : Promise.resolve([] as DraftRow[]),
    readDrafts((cols) => supabase.from("ledger_drafts").select(cols).eq("prepared_by", me).order("created_at", { ascending: false }).limit(40)),
    supabase.rpc("ledger_preparer_mine"),
    supabase.rpc("agent_my_agents"),
  ]);
  const tagNames = await loadTagNames(supabase, pending);
  const owned = await Promise.all(
    ownBooks.map(async (book) => {
      const [{ data: preps }, chart] = await Promise.all([
        supabase.rpc("ledger_preparers_list", { p_book: book.id }),
        bookChart(supabase, book.id).catch(() => [] as ChartAccount[]),
      ]);
      return {
        book,
        pending: pending.filter((d) => d.book_id === book.id),
        preparers: (preps ?? []) as PreparerRow[],
        chart,
        tagNames,
      };
    }),
  );
  return {
    owned,
    prepared: prepared.filter((d) => !ids.includes(d.book_id)),
    invitations: ((invites ?? []) as InvitationRow[]).filter((i) => i.status === "invited"),
    agents: ((agents ?? []) as AgentRow[]).filter((a) => a.status === "active"),
    preparing: books.filter((b) => b.role === "preparer"),
  };
}

export const AUDIT_PAGE = 50;

/** The book's audit log, newest first, a page at a time (`before` is the last id of the page shown). */
export async function loadAudit(supabase: SupabaseClient, bookId: string, before: number | null): Promise<{ rows: AuditRow[]; more: boolean }> {
  let q = supabase
    .from("ledger_audit_log")
    .select("id, book_id, at, actor_id, actor_name, via, action, entry_id, draft_id, before, after")
    .eq("book_id", bookId)
    .order("id", { ascending: false })
    .limit(AUDIT_PAGE + 1);
  if (before !== null) q = q.lt("id", before);
  const { data, error } = await q;
  if (error) throw new Error(`audit: ${error.message}`);
  const rows = (data ?? []) as AuditRow[];
  return { rows: rows.slice(0, AUDIT_PAGE), more: rows.length > AUDIT_PAGE };
}

export async function loadExceptions(
  supabase: SupabaseClient,
  bookId: string,
  opts: { from?: string | null; to?: string | null; backdateDays?: number; draftDays?: number } = {},
): Promise<ExceptionRow[]> {
  const { data, error } = await supabase.rpc("ledger_exceptions", {
    p_book: bookId,
    p_from: opts.from ?? null,
    p_to: opts.to ?? null,
    p_backdate_days: opts.backdateDays ?? 30,
    p_draft_days: opts.draftDays ?? 7,
  });
  if (error) throw new Error(`exceptions: ${error.message}`);
  return (data ?? []) as ExceptionRow[];
}

export interface CloseData {
  closings: { id: string; scope: "period" | "season"; season_id: string | null; period_from: string | null; period_to: string; created_at: string }[];
  reopens: { id: string; was_through: string; now_through: string | null; reason: string; reopened_at: string }[];
  /** The owner's completed seasons, with whether this book closed each already. */
  seasons: { id: string; name: string; closed: boolean }[];
}

export async function loadClose(supabase: SupabaseClient, bookId: string, me: string): Promise<CloseData> {
  const [{ data: closings }, { data: reopens }, { data: seasons }] = await Promise.all([
    supabase.from("ledger_closings").select("id, scope, season_id, period_from, period_to, created_at").eq("book_id", bookId).order("period_to", { ascending: false }),
    supabase.from("ledger_period_reopens").select("id, was_through, now_through, reason, reopened_at").eq("book_id", bookId).order("reopened_at", { ascending: false }),
    supabase.from("seasons").select("id, name").eq("owner_id", me).eq("status", "completed").order("planting_date", { ascending: false }).limit(50),
  ]);
  const cl = (closings ?? []) as CloseData["closings"];
  const closedSeasons = new Set(cl.filter((c) => c.scope === "season").map((c) => c.season_id));
  return {
    closings: cl,
    reopens: (reopens ?? []) as CloseData["reopens"],
    seasons: ((seasons ?? []) as { id: string; name: string }[]).map((s) => ({ ...s, closed: closedSeasons.has(s.id) })),
  };
}

export interface ReadableBook {
  id: string;
  kind: "farm" | "investor" | "platform";
  closed_through: string | null;
  owner_id: string | null;
}

/**
 * The book a review page shows: the one asked for if the policy lets the reader see it (his own, the platform's for an
 * administrator, or one an administrator's inspection opened), else his own farm book, else his investor book.
 */
export async function readableBook(
  supabase: SupabaseClient,
  me: string,
  id: string | null | undefined,
): Promise<{ book: ReadableBook | null; own: ReadableBook[] }> {
  const { data: ownRows } = await supabase.from("ledger_books").select("id, kind, closed_through, owner_id").eq("owner_id", me).order("kind");
  const own = (ownRows ?? []) as ReadableBook[];
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const { data } = await supabase.from("ledger_books").select("id, kind, closed_through, owner_id").eq("id", id).maybeSingle();
    if (data) return { book: data as ReadableBook, own };
  }
  return { book: own.find((b) => b.kind === "farm") ?? own[0] ?? null, own };
}

const KIND: Record<string, { ar: string; en: string }> = {
  farm: { ar: "دفتر المزرعة", en: "Farm book" },
  investor: { ar: "دفتر المستثمر", en: "Investor book" },
  platform: { ar: "دفتر المنصّة", en: "Platform book" },
};

export function bookLabel(b: Pick<WritableBook, "kind" | "role" | "owner_name">, locale: Locale): string {
  const k = KIND[b.kind] ?? { ar: b.kind, en: b.kind };
  const name = tr(locale, k.ar, k.en);
  return b.role === "preparer" ? `${name} — ${b.owner_name || tr(locale, "صاحبه", "its owner")}` : name;
}

