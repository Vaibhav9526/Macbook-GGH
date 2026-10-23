import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/**
 * What the remote desktop context reaches in main: the sessions this computer holds to other
 * servers.
 */
export interface RemoteDesktopPort {
  remoteDesktop: Pick<
    JargonDesktopApi["remoteDesktop"],
    "connect" | "disconnect" | "list" | "onEvent" | "selectDisplay"
  >;
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function remoteDesktopPort(): RemoteDesktopPort {
  return window.jargon;
}
