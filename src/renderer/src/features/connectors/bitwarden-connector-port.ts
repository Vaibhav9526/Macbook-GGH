import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/** What the Bitwarden page reaches in main: the connection of this computer. */
export type BitwardenConnectorPort = JargonDesktopApi["bitwardenConnector"];

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function bitwardenConnectorPort(): BitwardenConnectorPort {
  return window.jargon.bitwardenConnector;
}
