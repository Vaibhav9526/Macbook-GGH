import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/**
 * What the app shell and the cross-domain root modules reach in main, plus the shell actions
 * (`openUrl`, `openExternal`) that several domains share.
 */
export interface AppPort {
  getAppInfo: JargonDesktopApi["getAppInfo"];
  getAppInterfaceSizePreference: JargonDesktopApi["getAppInterfaceSizePreference"];
  getAppLanguagePreference: JargonDesktopApi["getAppLanguagePreference"];
  getAppLogoColorPreference: JargonDesktopApi["getAppLogoColorPreference"];
  onAppInterfaceSizePreference: JargonDesktopApi["onAppInterfaceSizePreference"];
  onAppLanguagePreference: JargonDesktopApi["onAppLanguagePreference"];
  onAppLogoColorPreference: JargonDesktopApi["onAppLogoColorPreference"];
  openExternal: JargonDesktopApi["openExternal"];
  openUrl: JargonDesktopApi["openUrl"];
  setAppInterfaceSizePreference: JargonDesktopApi["setAppInterfaceSizePreference"];
  setAppLanguagePreference: JargonDesktopApi["setAppLanguagePreference"];
  setAppLogoColorPreference: JargonDesktopApi["setAppLogoColorPreference"];
  agent: Pick<
    JargonDesktopApi["agent"],
    "readConversationPage" | "searchConversationMessages" | "searchConversationFiles" | "listRoutines" | "listAgents"
  >;
  agentTemplates: Pick<JargonDesktopApi["agentTemplates"], "onOpenLink" | "takePendingLink">;
  acpRegistry: JargonDesktopApi["acpRegistry"];
  hostedSites: JargonDesktopApi["hostedSites"];
  billing: JargonDesktopApi["billing"];
  license: JargonDesktopApi["license"];
  hostedServers: JargonDesktopApi["hostedServers"];
  routineFeed: JargonDesktopApi["routineFeed"];
  events: JargonDesktopApi["events"];
  plugins: Pick<JargonDesktopApi["plugins"], "onOpenListing" | "takePendingListing">;
  servers: Pick<JargonDesktopApi["servers"], "onInvite" | "takePendingInvite">;
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function appPort(): AppPort {
  return window.jargon;
}
