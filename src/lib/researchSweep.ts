import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * الكنس اليوميّ لدلو البحوث (public-api-4؛ المالك، 4 نوفمبر، السؤال 25).
 *
 * Only what the server itself handed out and nobody used is removed: a path in research_uploads, issued more than a
 * day ago, never claimed by a sending. A file a sending names is claimed (used_at), so it is never a candidate — the
 * sweep does not decide by what research_items happens to return, which a failed or capped read would empty and turn
 * into "delete the library". The links themselves are forgotten after a week, once their files are gone.
 */
export async function sweepResearchUploads(admin: SupabaseClient): Promise<{ removed: number }> {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .from("research_uploads")
    .select("path")
    .is("used_at", null)
    .lt("issued_at", dayAgo)
    .limit(1000);
  if (error) throw new Error(`research sweep: ${error.message}`);
  const stale = ((data ?? []) as { path: string }[]).map((r) => r.path);

  for (let i = 0; i < stale.length; i += 100) {
    const batch = stale.slice(i, i + 100);
    const { error: removeError } = await admin.storage.from("research").remove(batch);
    if (removeError) throw new Error(`research sweep: ${removeError.message}`);
    // Spent: neither sendable nor swept again.
    const { error: markError } = await admin.from("research_uploads").update({ used_at: new Date().toISOString() }).in("path", batch);
    if (markError) throw new Error(`research sweep: ${markError.message}`);
  }
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  // A spent link a week old is forgotten; its file is either a sending's (in research_items) or already removed.
  const { error: forgetError } = await admin.from("research_uploads").delete().lt("issued_at", weekAgo).not("used_at", "is", null);
  if (forgetError) throw new Error(`research sweep: ${forgetError.message}`);
  return { removed: stale.length };
}
