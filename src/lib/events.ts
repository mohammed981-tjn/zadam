/**
 * Browser events shared between components that have no parent-child
 * relationship — the navigation menu lives in the header, the assistant lives
 * at the end of the body, and neither should have to know about the other.
 */
export const OPEN_ASSISTANT_EVENT = "sudagri:open-assistant";

/**
 * The bottom bar on a phone opens the same menu the header's button does
 * (backlog 122), and shows it as the active destination while it is open.
 */
export const TOGGLE_MENU_EVENT = "sudagri:toggle-menu";
export const MENU_STATE_EVENT = "sudagri:menu-state";
