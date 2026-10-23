import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/**
 * What the settings context reaches in main: the app-wide preferences and the switches for
 * updates, notifications and the Dynamic Island.
 */
export interface SettingsPort {
  getAgentMemoryLimitPreference: JargonDesktopApi["getAgentMemoryLimitPreference"];
  getAnalyticsPreference: JargonDesktopApi["getAnalyticsPreference"];
  getAppBehaviorPreference: JargonDesktopApi["getAppBehaviorPreference"];
  getApprovalAutomation: JargonDesktopApi["getApprovalAutomation"];
  getBusyMessageModePreference: JargonDesktopApi["getBusyMessageModePreference"];
  getRemoteSessionReusePreference: JargonDesktopApi["getRemoteSessionReusePreference"];
  onAgentMemoryLimitPreference: JargonDesktopApi["onAgentMemoryLimitPreference"];
  onApprovalAutomation: JargonDesktopApi["onApprovalAutomation"];
  onOpenSettings: JargonDesktopApi["onOpenSettings"];
  setAnalyticsPreference: JargonDesktopApi["setAnalyticsPreference"];
  setAppBehaviorPreference: JargonDesktopApi["setAppBehaviorPreference"];
  setBusyMessageModePreference: JargonDesktopApi["setBusyMessageModePreference"];
  setRemoteSessionReusePreference: JargonDesktopApi["setRemoteSessionReusePreference"];
  dynamicIsland: Pick<
    JargonDesktopApi["dynamicIsland"],
    "getBuiltInDisplayGeometry" | "getPreference" | "setPreference"
  >;
  notifications: Pick<JargonDesktopApi["notifications"], "getPreference" | "openSettings" | "setPreference" | "test">;
  update: Pick<JargonDesktopApi["update"], "getPreference" | "onPreference" | "setPreference">;
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function settingsPort(): SettingsPort {
  return window.jargon;
}
