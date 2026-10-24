/**
 * Platform stage flags.
 *
 * INVESTMENT_LIVE gates the money flow. It stays false until sudagri has real,
 * legally documented projects and a real payment/custody arrangement behind
 * them. While it is false the UI shows a "coming soon" panel and the invest
 * server action refuses outright — the refusal lives on the server so a
 * hand-crafted POST cannot slip past a hidden button.
 *
 * SUPERSEDED (backlog 158): the app no longer reads this constant. The switch is
 * the `investment_live` row of `platform_flags`, which the database's own trigger
 * on `investments` reads as well (src/lib/platformFlags.ts). It stays here only
 * as the record of what the value was.
 */
export const INVESTMENT_LIVE = false;
