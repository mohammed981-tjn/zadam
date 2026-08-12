/**
 * Platform stage flags.
 *
 * INVESTMENT_LIVE gates the money flow. It stays false until sudagri has real,
 * legally documented projects and a real payment/custody arrangement behind
 * them. While it is false the UI shows a "coming soon" panel and the invest
 * server action refuses outright — the refusal lives on the server so a
 * hand-crafted POST cannot slip past a hidden button.
 */
export const INVESTMENT_LIVE = false;
