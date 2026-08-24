import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Confirms that an evidence record points at a file that exists.
 *
 * The three evidence actions each check that the path begins with the caller's
 * own id, which stops anyone claiming someone else's file. What none of them
 * checked was whether a file is there at all — the path is a string the client
 * chose, and the row was written on its word.
 *
 * That matters because enforce_milestone_approval treats `storage_path is not
 * null` as proof of work before a phase may be approved. The guarantee it
 * states is "no approval without evidence"; what it actually enforced was "no
 * approval without a row". A caller could send <own id>/x/y.jpg, upload
 * nothing, and satisfy it.
 *
 * Deliberately advisory rather than blocking on its own failure:
 *
 * The `evidence` bucket's policies are not in this repository, so whether the
 * uploader may LIST their own folder — as opposed to reading a file directly —
 * cannot be verified from here. If listing is refused, this returns `true` and
 * logs, leaving behaviour exactly as it was. It tightens the check where the
 * policy allows it and never invents a new way for an upload to fail.
 *
 * Once storage policies are in the repo and listing is known to work, the
 * `catch`-equivalent branch below can become a refusal.
 */
export async function evidenceFileExists(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf("/");
  if (lastSlash < 1) return false;

  const folder = storagePath.slice(0, lastSlash);
  const filename = storagePath.slice(lastSlash + 1);

  const { data, error } = await supabase.storage
    .from("evidence")
    .list(folder, { search: filename, limit: 100 });

  if (error) {
    console.warn(
      "evidenceFileExists: could not list the evidence folder, so the file " +
        "could not be confirmed. Accepting the record unchanged. This is the " +
        "expected result if the bucket's SELECT policy allows downloads but " +
        "not listing — see docs/security-review-2026-08-19.md, ص-1/ص-2.",
      { folder, error },
    );
    return true;
  }

  return (data ?? []).some((entry) => entry.name === filename);
}
