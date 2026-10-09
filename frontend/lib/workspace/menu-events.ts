/** Window event fired when menu items were added, renamed or removed at runtime (see
 *  notifyMenuChanged in lib/store/screen-index-store.ts). Its own module so the sidebar can
 *  listen for it without importing the screen-index store, which already imports the sidebar. */
export const MENU_CHANGED_EVENT = "nexuscore:menu-changed";
