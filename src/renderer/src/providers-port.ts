import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/**
 * What provider state reaches in main: connecting, signing in and refreshing providers, and the
 * runtimes Jargon installs for them, on this computer or on a host the account administers.
 */
export interface ProvidersPort {
  cancelProviderCodeLogin: JargonDesktopApi["cancelProviderCodeLogin"];
  connectProvider: JargonDesktopApi["connectProvider"];
  cancelProviderSignIn: JargonDesktopApi["cancelProviderSignIn"];
  refreshAgentProviders: JargonDesktopApi["refreshAgentProviders"];
  setProviderOn: JargonDesktopApi["setProviderOn"];
  restartProvider: JargonDesktopApi["restartProvider"];
  cancelProviderRestart: JargonDesktopApi["cancelProviderRestart"];
  startProviderCodeLogin: JargonDesktopApi["startProviderCodeLogin"];
  providerRuntimes: JargonDesktopApi["providerRuntimes"];
  connectProviderAccount: JargonDesktopApi["connectProviderAccount"];
  cancelProviderAccountSignIn: JargonDesktopApi["cancelProviderAccountSignIn"];
  renameProviderAccount: JargonDesktopApi["renameProviderAccount"];
  removeProviderAccount: JargonDesktopApi["removeProviderAccount"];
  /** The same, for the host of a joined server the account administers. */
  providerAdmin: JargonDesktopApi["providerAdmin"];
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function providersPort(): ProvidersPort {
  return window.jargon;
}
