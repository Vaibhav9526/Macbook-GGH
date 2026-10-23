import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/**
 * What the sidebar reaches in main: the saved sidebar layout and its changes.
 */
export interface SidebarPort {
  agent: Pick<JargonDesktopApi["agent"], "getSidebarLayout" | "mutateSidebarLayout">;
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function sidebarPort(): SidebarPort {
  return window.jargon;
}
