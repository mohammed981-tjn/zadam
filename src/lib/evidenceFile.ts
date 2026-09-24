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
 * WHY A FAILURE TO LIST IS NOW A REFUSAL
 *
 * This used to accept the row when listing failed, because the bucket's
 * policies were not known and the check must not invent a new way for an
 * upload to fail. They are known now. Production carries `evidence_read_own`
 * — SELECT on `storage.objects` for `bucket_id = 'evidence'` where the first
 * folder is `auth.uid()` — and the Storage API's list runs through
 * `storage.search`, which is SECURITY INVOKER, so that policy is exactly what
 * lets an uploader list their own folder. Checked 24 September 2026.
 *
 * So an error here is no longer "the policy forbids listing"; it is a real
 * failure, and a check that cannot confirm the file does not get to vouch for
 * it. Failing closed costs the farmer one retry. Failing open is the gap this
 * function exists to close: a row that `enforce_milestone_approval` counts as
 * proof of work, pointing at nothing.
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
    console.error(
      "evidenceFileExists: could not list the evidence folder, so the file " +
        "could not be confirmed. Refusing the record.",
      { folder, error },
    );
    return false;
  }

  return (data ?? []).some((entry) => entry.name === filename);
}
