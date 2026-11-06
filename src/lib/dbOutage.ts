/**
 * Whether an error from the database client is the way to the database failing (no connection, a timeout, a full pool,
 * a server that is down) rather than the database's own answer about the row (a trigger's message, a policy, a
 * constraint). Only the second is a refusal of what was sent; on the first nothing was decided, and the phone's outbox
 * keeps the entry and sends it again — the app's routes answer it with 503, a refusal with 400 (backlog 209).
 *
 * A refusal comes with a SQLSTATE that names the row's fault. No code at all (a fetch that never got an answer), the
 * connection, resource and operator classes (08, 53, 57 — a statement timeout is 57014 — 58, XX), a serialization or
 * deadlock retry (40001, 40P01), a lock not available (55P03), and PostgREST's own «could not reach the database»
 * (PGRST000–PGRST003) are outages.
 */
export function isDbOutage(error: { code?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = (error.code ?? "").trim();
  if (!code) return true;
  if (/^PGRST00[0-3]$/.test(code)) return true;
  if (/^(08|53|57|58|XX)/.test(code)) return true;
  return code === "40001" || code === "40P01" || code === "55P03";
}
