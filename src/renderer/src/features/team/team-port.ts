import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/**
 * What team presence reaches in main: who is online, and whether this member is typing.
 */
export interface TeamPort {
  servers: Pick<JargonDesktopApi["servers"], "onPresence" | "setTyping">;
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function teamPort(): TeamPort {
  return window.jargon;
}
