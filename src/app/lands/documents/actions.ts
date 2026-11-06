"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addLandDocumentStep } from "@/lib/landOwnerSteps";
import { getLocale } from "@/lib/locale";
import { loginHrefHere } from "@/lib/loginHere";

/**
 * Records an uploaded land document. Every check and the insert are `addLandDocumentStep` (lib/landOwnerSteps),
 * which the phone app's route uses too: a known kind, a path under this user's own folder, a file that is there.
 * The plot's documents_on_file is not touched here — a database trigger recomputes it from the stored files, so
 * the count can never say more than the files support.
 */
export async function addLandDocument(args: {
  landId: string;
  kind: string;
  storagePath: string;
  caption: string;
  /** EXIF read in the browser before compression re-encoded the file. */
  metadata?: unknown;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const result = await addLandDocumentStep(supabase, user.id, args, await getLocale());
  if (!result.ok) return result;

  revalidatePath("/lands");
  return { ok: true };
}
