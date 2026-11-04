/**
 * قراءة قيودي المتقابلة مع طلبات إلغائها (البند ١٩٢). Both lists are the reader's own, through functions that
 * check who is asking; the cancellation requests are hung on their entries so every page that counts confirmed
 * entries sees which of them were since reversed by agreement.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { attachReversals, type LinkRow, type ReversalRow } from "./ledgerLinks";

export async function loadLinks(supabase: SupabaseClient): Promise<LinkRow[]> {
  const [links, reversals] = await Promise.all([supabase.rpc("ledger_links_list"), supabase.rpc("ledger_link_reversals_list")]);
  return attachReversals((links.data ?? []) as LinkRow[], (reversals.data ?? []) as ReversalRow[]);
}
