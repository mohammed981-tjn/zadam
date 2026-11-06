import type { SupabaseClient } from "@supabase/supabase-js";
import { RESEARCH_KINDS, type ResearchKind } from "@/lib/research";
import { tr, type Locale } from "@/lib/i18n";

/**
 * مكتبة الدراسات والبحوث — القراءة (البند ٢٠٢، والتطبيق في البند ٢٠٣).
 *
 * The website's /library and /library/[id] and the phone app's /api/app/library read through these, each with its
 * own client, so both ask for the same public columns of the same published rows. The table itself answers only
 * what is published, whoever asks (20261026010000_research_library.sql); naming the columns keeps the sender's
 * contact and the reviewer out of the answer.
 */

/** The columns everyone may read (the migration's grant): no contact, no sender, no reviewer. */
export const RESEARCH_PUBLIC_COLUMNS =
  "id, kind, title, authors, institution, year, language, crop, state, abstract, file_path, link_url, published_at";

export interface PublishedResearch {
  id: string;
  kind: ResearchKind;
  title: string;
  authors: string;
  institution: string | null;
  year: number | null;
  language: "ar" | "en" | "other";
  crop: string | null;
  state: string | null;
  abstract: string;
  file_path: string | null;
  link_url: string | null;
  published_at: string;
}

/** The kind filter as given, if it is one; the search words cut to 80 characters. */
export function researchFilter(kind: unknown, q: unknown): { kind: ResearchKind | null; q: string } {
  return {
    kind: typeof kind === "string" && (RESEARCH_KINDS as readonly string[]).includes(kind) ? (kind as ResearchKind) : null,
    q: typeof q === "string" ? q.trim().slice(0, 80) : "",
  };
}

/** What is published, newest first, by kind and by words in the title, abstract, crop or authors. */
export async function listPublishedResearch(
  supabase: SupabaseClient,
  filter: { kind: ResearchKind | null; q: string },
): Promise<{ items: PublishedResearch[]; error: string | null }> {
  let query = supabase
    .from("research_items")
    .select(RESEARCH_PUBLIC_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);
  if (filter.kind) query = query.eq("kind", filter.kind);
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_,()]/g, " ")}%`;
    query = query.or(`title.ilike.${like},abstract.ilike.${like},crop.ilike.${like},authors.ilike.${like}`);
  }
  const { data, error } = await query;
  return { items: (data ?? []) as PublishedResearch[], error: error?.message ?? null };
}

/** One published work, or null (an id that is not a uuid is not asked about). */
export async function loadPublishedResearch(supabase: SupabaseClient, id: string): Promise<PublishedResearch | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabase
    .from("research_items")
    .select(RESEARCH_PUBLIC_COLUMNS)
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  return (data as PublishedResearch | null) ?? null;
}

/** «استشهد به هكذا». */
export function researchCitation(item: Pick<PublishedResearch, "authors" | "year" | "title" | "institution">, locale: Locale) {
  return `${item.authors}${item.year ? ` (${item.year})` : ""}. ${item.title}.${item.institution ? ` ${item.institution}.` : ""} ${tr(locale, "مكتبة سوداقري", "Sudagri library")}.`;
}
