import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * «نزّل بياناتي» (البند ١٩٥، وإصلاح ١٩٨ ج١١): الملفّ يحمل كلّ صفٍّ للحساب، لا ما يعطيه طلبٌ واحد. القاعدة لا تعطي في
 * الطلب الواحد أكثر من ١٠٠٠ صفّ مهما طُلب، فكان من له أكثر يأخذ ملفّاً مقطوعاً لا يقول إنّه ناقص. كلّ جدولٍ هنا يُقرأ
 * صفحةً صفحة بترتيبٍ ثابت حتى آخره، وما تعذّرت قراءته يُوقف الملفّ كلّه بسببه بدل أن يصل ناقصاً بصمت.
 */

/** The most rows one request returns (the API's own limit); a full page means there may be more. */
export const API_ROWS = 1000;

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Reads one query to its end, a page at a time. `page(from, to)` must order by a unique column so pages do not overlap. */
export async function readAll<T>(label: string, page: (from: number, to: number) => Page): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += API_ROWS) {
    const { data, error } = await page(from, from + API_ROWS - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < API_ROWS) return out;
  }
}

export interface AccountFile {
  exported_at: string;
  account: Record<string, unknown>;
  lands: unknown[];
  seasons: unknown[];
  season_entries: unknown[];
  ledger: { books: unknown[]; accounts: unknown[]; entries: unknown[]; lines: unknown[]; links: unknown[] };
  partnership: { agreements: unknown[]; signatures: unknown[] };
  investments: unknown[];
  /** وضع الوكيل (البند ١٦٩): من أذن له صاحب الحساب أن يعمل عنه، وما كتبه باسمه. */
  agents: { mandates: unknown[]; actions: unknown[] };
}

/** Everything the reader may read that is theirs, as the reader: what the row policies keep from them stays out. */
export async function buildAccountFile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; phone?: string | null },
): Promise<AccountFile> {
  const me = user.id;
  const books = await readAll<{ id: string }>("ledger_books", (a, z) =>
    supabase.from("ledger_books").select("*").eq("owner_id", me).order("id").range(a, z),
  );
  const bookIds = books.map((b) => b.id);
  const inBooks = (table: string) =>
    bookIds.length
      ? readAll(table, (a, z) => supabase.from(table).select("*").in("book_id", bookIds).order("id").range(a, z))
      : Promise.resolve([] as unknown[]);
  const seasons = await readAll<{ id: string }>("seasons", (a, z) =>
    supabase.from("seasons").select("*").eq("owner_id", me).order("id").range(a, z),
  );
  const seasonIds = seasons.map((s) => s.id);

  const [profile, lands, seasonEntries, entries, lines, accounts, links, agreements, signatures, investments, mandates, agentActions] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, country, created_at").eq("id", me).maybeSingle(),
    readAll("lands", (a, z) => supabase.from("lands").select("*").eq("owner_id", me).order("id").range(a, z)),
    seasonIds.length
      ? readAll("ledger_entries", (a, z) => supabase.from("ledger_entries").select("*").in("season_id", seasonIds).order("id").range(a, z))
      : Promise.resolve([] as unknown[]),
    inBooks("journal_entries"),
    inBooks("journal_lines"),
    inBooks("ledger_accounts"),
    readAll("ledger_links", (a, z) =>
      supabase.from("ledger_links").select("*").or(`proposer_owner.eq.${me},counter_owner.eq.${me}`).order("id").range(a, z),
    ),
    readAll("partnership_agreements", (a, z) =>
      supabase.from("partnership_agreements").select("*").or(`owner_id.eq.${me},investor_id.eq.${me}`).order("id").range(a, z),
    ),
    readAll("partnership_signatures", (a, z) =>
      supabase.from("partnership_signatures").select("*").eq("signer_id", me).order("id").range(a, z),
    ),
    readAll("investments", (a, z) => supabase.from("investments").select("*").eq("investor_id", me).order("id").range(a, z)),
    readAll("agent_mandates", (a, z) => supabase.from("agent_mandates").select("*").eq("farmer_id", me).order("id").range(a, z)),
    readAll("agent_actions", (a, z) => supabase.from("agent_actions").select("*").eq("farmer_id", me).order("id").range(a, z)),
  ]);
  if (profile.error) throw new Error(`profiles: ${profile.error.message}`);

  return {
    exported_at: new Date().toISOString(),
    account: { id: me, email: user.email ?? null, phone: user.phone ?? null, ...((profile.data as Record<string, unknown> | null) ?? {}) },
    lands,
    seasons,
    season_entries: seasonEntries,
    ledger: { books, accounts, entries, lines, links },
    partnership: { agreements, signatures },
    investments,
    agents: { mandates, actions: agentActions },
  };
}
