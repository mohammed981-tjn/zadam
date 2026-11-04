import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * الكنس اليوميّ لدلو البحوث (public-api-4؛ المالك، 4 نوفمبر، السؤال 25).
 *
 * A file uploaded through a link that no sending followed within a day is removed from `research/incoming/`, and the
 * links the server gave are forgotten after a week. What a sending names is never touched: it is in research_items.
 * Runs with the service key from the daily health run.
 */
export async function sweepResearchUploads(admin: SupabaseClient): Promise<{ removed: number }> {
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const kept = new Set<string>();
  const { data: items } = await admin.from("research_items").select("file_path").not("file_path", "is", null);
  for (const i of (items ?? []) as { file_path: string }[]) kept.add(i.file_path);

  const stale: string[] = [];
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const { data: files, error } = await admin.storage.from("research").list("incoming", { limit: 1000, offset });
    if (error) throw new Error(`research sweep: ${error.message}`);
    for (const f of files ?? []) {
      const path = `incoming/${f.name}`;
      const at = Date.parse(f.created_at ?? "");
      if (!kept.has(path) && Number.isFinite(at) && at < dayAgo) stale.push(path);
    }
    if (!files || files.length < 1000) break;
  }
  for (let i = 0; i < stale.length; i += 100) {
    const { error } = await admin.storage.from("research").remove(stale.slice(i, i + 100));
    if (error) throw new Error(`research sweep: ${error.message}`);
  }
  await admin.from("research_uploads").delete().lt("issued_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
  return { removed: stale.length };
}
